import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";


// ==========================================================
// SHOPIFY FULFILLMENT EVENT PAYLOAD
// ==========================================================

type ShopifyFulfillmentEventPayload = {
  id?: number | string;
  order_id?: number | string;
  fulfillment_id?: number | string;
  status?: string;
  happened_at?: string;
};


// ==========================================================
// FULFILLMENT EVENTS / CREATE WEBHOOK
//
// This webhook tells HairGrab about carrier/fulfillment
// tracking events.
//
// IMPORTANT:
// We are NOT changing seller payout status in this file yet.
// First we establish the authenticated delivery receiver.
// The next step will safely connect confirmed deliveries
// to the correct seller/order without double-counting.
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {

  const {
    topic,
    shop,
    payload,
  } = await authenticate.webhook(request);


  if (topic !== "FULFILLMENT_EVENTS_CREATE") {
    console.log(
      `[HairGrab Core] Ignored webhook topic ${topic} from ${shop}`,
    );

    return new Response("OK", {
      status: 200,
    });
  }


  const event =
    payload as ShopifyFulfillmentEventPayload;


  const orderId =
    event?.order_id
      ? String(event.order_id)
      : null;

  const fulfillmentId =
    event?.fulfillment_id
      ? String(event.fulfillment_id)
      : null;

  const status =
    String(event?.status || "")
      .trim()
      .toLowerCase();


  console.log(
    `[HairGrab Core] Fulfillment event received from ${shop}: order=${orderId}, fulfillment=${fulfillmentId}, status=${status}.`,
  );


  if (status === "delivered") {
    console.log(
      `[HairGrab Core] Confirmed delivery event received for Shopify order ${orderId}.`,
    );
  }


  return new Response("OK", {
    status: 200,
  });
};