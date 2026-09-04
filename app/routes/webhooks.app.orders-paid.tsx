import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";


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