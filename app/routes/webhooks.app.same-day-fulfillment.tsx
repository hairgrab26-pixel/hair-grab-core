import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { schedulerForShop } from "../same-day-shopify.server";
import { reconcileSameDayFulfillmentEvent } from "../same-day-fulfillment-events.server";
import { reconcileSellerFulfillment } from "../same-day-dispatch-store.server";
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, payload, shop, admin } = await authenticate.webhook(request);
  if (process.env.HAIRGRAB_SAME_DAY_LIFECYCLE_READY !== "true") return new Response(null, { status: 503 });
  if (!admin) return new Response(null, { status: 503 });
  try {
    await reconcileSameDayFulfillmentEvent(topic, payload, admin, schedulerForShop(shop),
      id => db.seller.findUnique({ where: { shopifyFulfillmentLocationId: id }, select: { id: true } }),
      (sellerId, orderId) => reconcileSellerFulfillment(sellerId, orderId, shop));
    return new Response(null, { status: 200 });
  } catch {
    // Retry out-of-order ledger/assignment events; no payload or private data is logged.
    return new Response(null, { status: 503 });
  }
};
