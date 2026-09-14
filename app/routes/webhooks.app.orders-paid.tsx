import type { ActionFunctionArgs } from "react-router";

import { authenticate, unauthenticated } from "../shopify.server";
import db from "../db.server";
import {
  allocateProcessingFeeCents,
  calculateFeeAdjustedSellerEarningsCents,
  extractCaptureProcessingFee,
  type ShopifyPaymentTransaction,
} from "../processing-fees.server";


// ==========================================================
// SHOPIFY ORDER PAYLOAD
// Only the fields HairGrab Core needs for orders/paid.
// ==========================================================

type ShopifyOrderPayload = {
  id: number | string;
  name?: string;
  financial_status?: string | null;
};


// ==========================================================
// ORDERS / PAID WEBHOOK
//
// IMPORTANT:
// This means the CUSTOMER paid Shopify.
//
// It does NOT mean:
// - seller payout is ready
// - seller is eligible for payout
// - seller has been paid
//
// This webhook only clears the customer-payment side
// of the seller ledger.
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {

  const {
    topic,
    shop,
    payload,
  } = await authenticate.webhook(request);


  // Shopify React Router webhook topics use screaming case.
  if (topic !== "ORDERS_PAID") {
    console.log(
      `[HairGrab Core] Ignored webhook topic ${topic} from ${shop}`,
    );

    return new Response("OK", {
      status: 200,
    });
  }


  const order =
    payload as ShopifyOrderPayload;


  if (!order?.id) {
    console.error(
      "[HairGrab Core] orders/paid webhook received without an order ID.",
    );

    return new Response("OK", {
      status: 200,
    });
  }


  const orderId =
    String(order.id);

  const orderName =
    order.name || orderId;

  // Resolve the authoritative successful-capture fee before clearing funds.
  // Unresolved fees remain out of payout eligibility and can be retried safely.
  const feeFinalized = await reconcileProcessingFee(orderId, shop);
  if (!feeFinalized) {
    return new Response("Processing fee reconciliation is pending.", {
      status: 500,
    });
  }


  // ========================================================
  // CLEAR CUSTOMER PAYMENT
  //
  // Every seller-owned SALE line created by orders/create
  // for this Shopify order is moved from:
  //
  // AWAITING_CLEARANCE → CLEARED
  //
  // Seller payout status remains PENDING.
  // ========================================================

  const result =
    await db.sellerLedgerEntry.updateMany({
      where: {
        shopifyOrderId:
          orderId,

        entryType:
          "SALE",

        fundsStatus:
          "AWAITING_CLEARANCE",
      },

      data: {
        fundsStatus:
          "CLEARED",

        fundsClearedAt:
          new Date(),
      },
    });


  console.log(
    `[HairGrab Core] ${orderName} customer payment confirmed. Cleared ${result.count} seller ledger entr${result.count === 1 ? "y" : "ies"}.`,
  );


  return new Response("OK", {
    status: 200,
  });
};

const ORDER_TRANSACTIONS_QUERY = `#graphql
  query OrderTransactions($id: ID!) {
    order(id: $id) {
      transactions {
        id
        kind
        status
        fees {
          type
          amount { amount currencyCode }
          taxAmount { amount currencyCode }
        }
      }
    }
  }
`;

type OrderTransactionsResponse = {
  data?: { order?: { transactions?: ShopifyPaymentTransaction[] | null } | null };
  errors?: Array<{ message?: string }>;
};

async function loadOrderTransactions(shop: string, orderId: string) {
  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(ORDER_TRANSACTIONS_QUERY, {
    variables: { id: `gid://shopify/Order/${orderId}` },
  });
  const json = (await response.json()) as OrderTransactionsResponse;
  if (json.errors?.length) {
    throw new Error(
      json.errors.map((error) => error.message || "Unknown Shopify error").join("; "),
    );
  }
  const transactions = json.data?.order?.transactions;
  if (!Array.isArray(transactions)) {
    throw new Error("Shopify did not return order transactions.");
  }
  return transactions;
}

async function reconcileProcessingFee(orderId: string, shop: string) {
  const sales = await db.sellerLedgerEntry.findMany({
    where: { shopifyOrderId: orderId, entryType: "SALE" },
    select: {
      id: true,
      grossAmountCents: true,
      commissionAmountCents: true,
      currency: true,
      processingFeeStatus: true,
    },
  });
  if (sales.length === 0) return true;

  const statuses = new Set(sales.map((sale) => sale.processingFeeStatus));
  if (statuses.size === 1 && statuses.has("FINALIZED")) {
    console.log(`[HairGrab Core] Processing fee already finalized for order ${orderId}.`);
    return true;
  }
  if (statuses.has("FINALIZED")) {
    console.error(`[HairGrab Core] Processing fee state is inconsistent for order ${orderId}.`);
    return false;
  }

  const currencies = new Set(sales.map((sale) => sale.currency));
  if (currencies.size !== 1) {
    console.error(`[HairGrab Core] Cannot finalize processing fee for order ${orderId}: mixed ledger currencies.`);
    return false;
  }

  let transactions: ShopifyPaymentTransaction[];
  try {
    transactions = await loadOrderTransactions(shop, orderId);
  } catch (error) {
    console.error(
      `[HairGrab Core] Processing fee query failed for order ${orderId}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return false;
  }

  const feeResult = extractCaptureProcessingFee(transactions, sales[0].currency);
  if (!feeResult.finalized) {
    console.error(`[HairGrab Core] Processing fee unavailable for order ${orderId}: ${feeResult.reason}`);
    return false;
  }
  if (feeResult.totalFeeCents > 0 && !feeResult.feeCurrency) {
    console.error(`[HairGrab Core] Processing fee currency missing for order ${orderId}.`);
    return false;
  }

  const allocation = allocateProcessingFeeCents(
    feeResult.totalFeeCents,
    sales.map((sale) => ({ id: sale.id, grossAmountCents: sale.grossAmountCents })),
  );
  if (!allocation.ok) {
    console.error(`[HairGrab Core] Processing fee allocation failed for order ${orderId}: ${allocation.reason}`);
    return false;
  }

  for (const sale of sales) {
    const processingFeeCents = allocation.allocations.get(sale.id) || 0;
    if (
      calculateFeeAdjustedSellerEarningsCents(
        sale.grossAmountCents,
        sale.commissionAmountCents,
        processingFeeCents,
      ) === null
    ) {
      console.error(`[HairGrab Core] Processing fee exceeds seller earnings for order ${orderId}.`);
      return false;
    }
  }

  const finalizedAt = new Date();
  await db.$transaction(async (tx) => {
    const currentSales = await tx.sellerLedgerEntry.findMany({
      where: { shopifyOrderId: orderId, entryType: "SALE" },
      select: { id: true, processingFeeStatus: true },
    });
    if (currentSales.length === 0 || currentSales.every((sale) => sale.processingFeeStatus === "FINALIZED")) return;
    if (currentSales.some((sale) => sale.processingFeeStatus === "FINALIZED")) {
      throw new Error("Processing fee state changed concurrently.");
    }
    if (
      currentSales.length !== sales.length ||
      currentSales.some((sale) => !sales.some((initial) => initial.id === sale.id))
    ) {
      throw new Error("SALE entries changed while processing the fee.");
    }
    for (const sale of sales) {
      const processingFeeCents = allocation.allocations.get(sale.id) || 0;
      await tx.sellerLedgerEntry.update({
        where: { id: sale.id },
        data: {
          processingFeeCents,
          processingFeeStatus: "FINALIZED",
          processingFeeFinalizedAt: finalizedAt,
          sellerEarningsCents: calculateFeeAdjustedSellerEarningsCents(
            sale.grossAmountCents,
            sale.commissionAmountCents,
            processingFeeCents,
          ) as number,
        },
      });
    }
  });

  console.log(`[HairGrab Core] Finalized processing fee for order ${orderId}: ${feeResult.totalFeeCents} cents across ${feeResult.captureCount} capture(s).`);
  return true;
}
