import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";


// ==========================================================
// SHOPIFY ORDER WEBHOOK PAYLOAD
// ==========================================================

type ShopifyOrderLineItem = {
  id: number | string;
  title?: string;
  name?: string;
  vendor?: string | null;
  price?: string;
  quantity?: number;
  total_discount?: string;
};

type ShopifyOrderPayload = {
  id: number | string;
  name?: string;
  currency?: string;
  created_at?: string;
  financial_status?: string | null;
  line_items?: ShopifyOrderLineItem[];
};


// ==========================================================
// MONEY HELPERS
// ==========================================================

function dollarsToCents(
  value:
    | string
    | number
    | undefined,
) {
  const amount =
    typeof value === "number"
      ? value
      : Number(value || 0);

  if (
    !Number.isFinite(
      amount,
    )
  ) {
    return 0;
  }

  return Math.round(
    amount * 100,
  );
}


function normalizeVendor(
  value?:
    | string
    | null,
) {
  return String(
    value || "",
  )
    .trim()
    .toLowerCase();
}


function formatMoney(
  cents: number,
  currency: string,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        currency ||
        "USD",
    },
  ).format(
    cents / 100,
  );
}


// ==========================================================
// ORDERS / CREATE WEBHOOK
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const {
    topic,
    shop,
    payload,
  } =
    await authenticate.webhook(
      request,
    );


  // Shopify React Router webhook topics
  // use screaming case.
  if (
    topic !==
    "ORDERS_CREATE"
  ) {
    console.log(
      `[HairGrab Core] Ignored webhook topic ${topic} from ${shop}`,
    );

    return new Response(
      "OK",
      {
        status:
          200,
      },
    );
  }


  const order =
    payload as ShopifyOrderPayload;


  if (
    !order?.id
  ) {
    console.error(
      "[HairGrab Core] orders/create webhook received without an order ID.",
    );

    return new Response(
      "OK",
      {
        status:
          200,
      },
    );
  }


  const orderId =
    String(
      order.id,
    );


  const orderName =
    order.name ||
    orderId;


  const currency =
    order.currency ||
    "USD";


  const shopifyCreatedAt =
    order.created_at
      ? new Date(
          order.created_at,
        )
      : new Date();


  const lineItems =
    Array.isArray(
      order.line_items,
    )
      ? order.line_items
      : [];


  console.log(
    `[HairGrab Core] Processing ${orderName} from ${shop} with ${lineItems.length} line item(s).`,
  );


  // ========================================================
  // LOAD ACTIVE HAIRGRAB SELLERS
  // ========================================================

  const sellers =
    await db.seller.findMany({
      where: {
        status:
          "ACTIVE",
      },
    });


  const sellerByVendor =
    new Map(
      sellers
        .filter(
          (
            seller,
          ) =>
            seller.shopifyVendor &&
            seller.shopifyVendor
              .trim()
              .length >
              0,
        )
        .map(
          (
            seller,
          ) => [
            normalizeVendor(
              seller.shopifyVendor,
            ),

            seller,
          ],
        ),
    );


  // ========================================================
  // SELLER ORDER ALERT ACCUMULATOR
  //
  // One Shopify order can contain products from several
  // HairGrab sellers.
  //
  // Each seller receives ONE alert for their portion.
  // ========================================================

  const sellerOrderAlerts =
    new Map<
      string,
      {
        sellerId: string;
        sellerCode: string;
        grossAmountCents: number;
        quantity: number;
        lineCount: number;
      }
    >();


  // ========================================================
  // PROCESS EACH SHOPIFY LINE ITEM
  // ========================================================

  for (
    const lineItem of
    lineItems
  ) {
    const vendor =
      String(
        lineItem.vendor ||
          "",
      ).trim();


    if (
      !vendor
    ) {
      console.log(
        `[HairGrab Core] Skipping line ${lineItem.id}: no Shopify vendor.`,
      );

      continue;
    }


    const seller =
      sellerByVendor.get(
        normalizeVendor(
          vendor,
        ),
      );


    if (
      !seller
    ) {
      console.log(
        `[HairGrab Core] Skipping vendor "${vendor}" on ${orderName}: no active HairGrab seller match.`,
      );

      continue;
    }


    const quantity =
      Math.max(
        Number(
          lineItem.quantity ||
            0,
        ),
        0,
      );


    const unitPriceCents =
      dollarsToCents(
        lineItem.price,
      );


    const lineSubtotalCents =
      unitPriceCents *
      quantity;


    const discountCents =
      dollarsToCents(
        lineItem.total_discount,
      );


    const grossAmountCents =
      Math.max(
        lineSubtotalCents -
          discountCents,
        0,
      );


    const commissionRate =
      seller.commissionRate;


    const commissionAmountCents =
      Math.round(
        grossAmountCents *
          (commissionRate /
            100),
      );


    const sellerEarningsCents =
      Math.max(
        grossAmountCents -
          commissionAmountCents,
        0,
      );


    // ======================================================
    // COLLECT SELLER'S PORTION FOR ALERT
    // ======================================================

    const existingAlert =
      sellerOrderAlerts.get(
        seller.id,
      );


    if (
      existingAlert
    ) {
      existingAlert.grossAmountCents +=
        grossAmountCents;

      existingAlert.quantity +=
        quantity;

      existingAlert.lineCount +=
        1;
    } else {
      sellerOrderAlerts.set(
        seller.id,
        {
          sellerId:
            seller.id,

          sellerCode:
            seller.sellerCode,

          grossAmountCents,

          quantity,

          lineCount:
            1,
        },
      );
    }


    // ======================================================
    // LEDGER IDEMPOTENCY
    // ======================================================

    const idempotencyKey =
      `SALE:${orderId}:${String(
        lineItem.id,
      )}`;


    const existingEntry =
      await db.sellerLedgerEntry.findUnique({
        where: {
          idempotencyKey,
        },
      });


    if (
      existingEntry
    ) {
      console.log(
        `[HairGrab Core] Ledger entry already exists for ${orderName}, line ${lineItem.id}. Skipping duplicate ledger entry.`,
      );

      continue;
    }


    // ======================================================
    // CREATE SELLER LEDGER ENTRY
    // ======================================================

    await db.sellerLedgerEntry.create({
      data: {
        sellerId:
          seller.id,

        shopifyOrderId:
          orderId,

        shopifyOrderName:
          orderName,

        shopifyLineItemId:
          String(
            lineItem.id,
          ),

        idempotencyKey,

        entryType:
          "SALE",

        status:
          "PENDING",

        currency,

        // Commission rate used when THIS sale happened.
        commissionRate,

        grossAmountCents,

        commissionAmountCents,

        sellerEarningsCents,

        refundAmountCents:
          0,

        payoutAmountCents:
          0,

        description:
          lineItem.title ||
          lineItem.name ||
          `Sale from ${orderName}`,

        fundsStatus:
          "AWAITING_CLEARANCE",

        shopifyCreatedAt,
      },
    });


    console.log(
      `[HairGrab Core] ${orderName} → ${seller.sellerCode} → Gross ${grossAmountCents} cents → HairGrab ${commissionAmountCents} cents → Seller ${sellerEarningsCents} cents.`,
    );
  }


  // ========================================================
  // CREATE ONE NEW-ORDER NOTIFICATION PER SELLER
  //
  // Uses the same dedupe key as HairGrab's notification
  // sync engine so it can NEVER create a duplicate.
  // ========================================================

  for (
    const alert of
    sellerOrderAlerts.values()
  ) {
    const itemWord =
      alert.quantity ===
      1
        ? "item"
        : "items";


    const notificationMessage =
      `${orderName} · ` +
      `${formatMoney(
        alert.grossAmountCents,
        currency,
      )} · ` +
      `${alert.quantity} ${itemWord}`;


    const dedupeKey =
      `new-order:${alert.sellerId}:${orderId}`;


    await db.sellerNotification.upsert({
      where: {
        dedupeKey,
      },

      update: {},

      create: {
        sellerId:
          alert.sellerId,

        type:
          "NEW_ORDER",

        title:
          "New HairGrab Order! 🎉",

        message:
          notificationMessage,

        linkUrl:
          "/seller/orders",

        dedupeKey,
      },
    });


    console.log(
      `[HairGrab Core] Order alert created for ${alert.sellerCode}: ${notificationMessage}`,
    );
  }


  // Shopify expects a successful response.
  return new Response(
    "OK",
    {
      status:
        200,
    },
  );
};