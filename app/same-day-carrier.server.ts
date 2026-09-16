// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import db from "./db.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { createSameDayQuoteService } from "./same-day-delivery.server.ts";
// @ts-ignore Node strip-types imports
import { normalizePickup, sellerProvisioningReady } from "./same-day-provisioning-state.server.ts";

type CarrierItem = { product_id?: string | number; variant_id?: string | number; requires_shipping?: boolean; quantity?: number };
type CarrierRequest = { rate?: { currency?: string; items?: CarrierItem[]; destination?: Record<string, unknown> } };
const gid = (kind: string, value: string | number) => String(value).startsWith("gid://") ? String(value) : `gid://shopify/${kind}/${value}`;
const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const destination = (value: Record<string, unknown> | undefined) => {
  if (!value) return null;
  const address1 = text(value.address1), city = text(value.city), state = text(value.province), postalCode = text(value.postal_code), country = text(value.country);
  return address1 && city && state && postalCode && country ? { address1, city, state, postalCode, country, address2: text(value.address2), } : null;
};

export function createCarrierRateHandler(quote = createSameDayQuoteService(), readProducts: (ids: string[]) => Promise<any[]> = async (ids) => db.sellerProduct.findMany({ where: { shopifyProductId: { in: ids.flatMap(id => [id, id.split("/").pop()!]) } }, select: { shopifyProductId: true, sellerId: true, seller: { select: { id: true, status: true, offersSameDayDelivery: true, businessName: true, phone: true, address1: true, address2: true, city: true, state: true, postalCode: true, country: true, sameDayProvisioningStatus: true, sameDayProvisioningData: true, shopifyFulfillmentServiceId: true, shopifyFulfillmentLocationId: true } } } })) {
  return async function handle(input: CarrierRequest) {
    const rate = input?.rate;
    if (!rate || String(rate.currency || "").toUpperCase() !== "USD" || !Array.isArray(rate.items) || !rate.items.length) return { rates: [] };
    const dest = destination(rate.destination);
    if (!dest) return { rates: [] };
    const items = rate.items.filter((item) => item.requires_shipping !== false);
    if (!items.length || items.some((item) => !item.product_id && !item.variant_id)) return { rates: [] };
    const productIds = items.map((item) => item.product_id ? gid("Product", item.product_id) : "");
    if (productIds.some((id) => !id)) return { rates: [] };
    const rows = await readProducts([...new Set(productIds)]);
    const owners = new Set(rows.map((row) => row.sellerId));
    if (rows.length !== new Set(productIds).size || owners.size !== 1) return { rates: [] };
    const seller = rows[0]?.seller;
    if (!seller || seller.id !== rows[0].sellerId || !sellerProvisioningReady(seller) ||
        rows.some(row => !productIds.includes(gid("Product", row.shopifyProductId)))) return { rates: [] };
    try { normalizePickup(seller); } catch { return { rates: [] }; }
    const result = await quote({ sellerId: seller.id, destination: dest });
    if (!result.available || result.sellerId !== seller.id || !result.quotes.length) return { rates: [] };
    // A seller may disable or change pickup while the live quote is in flight.
    const current = await readProducts([...new Set(productIds)]);
    if (current.length !== rows.length || current.some(row => row.sellerId !== seller.id || !sellerProvisioningReady(row.seller) ||
        !productIds.includes(gid("Product", row.shopifyProductId)) ||
        row.seller.sameDayProvisioningData?.fingerprints?.pickup !== seller.sameDayProvisioningData?.fingerprints?.pickup)) return { rates: [] };
    const selected = result.quotes[0];
    return { rates: [{ service_name: "HairGrab Same-Day Delivery", service_code: `hairgrab_same_day_${seller.id}`, total_price: String(selected.shopperChargeCents), currency: "USD", description: "Same-day delivery" }] };
  };
}
