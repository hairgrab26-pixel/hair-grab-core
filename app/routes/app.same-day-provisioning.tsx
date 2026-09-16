import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { assertMarketplaceShop, productionProvisioningContext, provisioningStatus, runProvisioningBatch, setSellerSameDayEnabled } from "../same-day-provisioning-store.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await assertMarketplaceShop(session.shop);
  const ids = new URL(request.url).searchParams.getAll("sellerId");
  if (!ids.length || ids.length > 100) return Response.json({ error: "Select 1–100 sellers." }, { status: 400 });
  return Response.json({ sellers: await provisioningStatus(ids) });
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json().catch(() => ({}));
  const ids = body.sellerIds || (body.sellerId ? [body.sellerId] : []);
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== "string" || !id)) return Response.json({ error: "Select 1–100 sellers." }, { status: 400 });
  if (!["enable", "disable", "provision", "retry", "reconcile", "reenable"].includes(body.intent)) return Response.json({ error: "Invalid operation." }, { status: 400 });
  // Deployment alone cannot authorize provisioning or database control operations.
  if (process.env.HAIRGRAB_SAME_DAY_ADMIN_OPERATIONS !== "true") return Response.json({ error: "Same-Day administration is not enabled." }, { status: 409 });
  try {
    await assertMarketplaceShop(session.shop);
    if (["enable", "disable", "reenable"].includes(body.intent)) {
      for (const id of [...new Set(ids)] as string[]) await setSellerSameDayEnabled(id, body.intent !== "disable");
    }
    const results = ["provision", "retry", "reconcile", "reenable"].includes(body.intent)
      ? await runProvisioningBatch(ids, productionProvisioningContext(session.shop, admin, session.accessToken!), {
        batchSize: Number(body.batchSize) || 10, concurrency: Number(body.concurrency) || 2,
        action: body.intent === "reconcile" ? "reconcile" : "provision" }) : [];
    return Response.json({ results, sellers: await provisioningStatus(ids) });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "OPERATION_FAILED";
    return Response.json({ error: code }, { status: 409 });
  }
};
