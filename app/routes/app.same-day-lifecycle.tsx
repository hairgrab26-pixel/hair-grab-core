import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { reconcileSellerFulfillment } from "../same-day-dispatch-store.server";
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (process.env.HAIRGRAB_SAME_DAY_ADMIN_OPERATIONS !== "true") return Response.json({ error: "Same-Day administration is not enabled." }, { status: 409 });
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.orders) || !body.orders.length || body.orders.length > 100 || body.orders.some((o: any) => typeof o.sellerId !== "string" || !/^\d+$/.test(o.orderId))) return Response.json({ error: "Select 1–100 seller orders." }, { status: 400 });
  const results = [];
  for (const order of body.orders) {
    try { results.push({ sellerId: order.sellerId, orderId: order.orderId, ok: true, result: await reconcileSellerFulfillment(order.sellerId, order.orderId, session.shop) }); }
    catch { results.push({ sellerId: order.sellerId, orderId: order.orderId, ok: false, error: "RECONCILIATION_REQUIRED" }); }
  }
  return Response.json({ results });
};
