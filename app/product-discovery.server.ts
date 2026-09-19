// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import { displayProductCategory } from "./product-categories.ts";
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import { parseAdminProductAttributes } from "../lib/shopify/attributeParser.ts";

export type DiscoveryProduct = {
  id: string; title: string; handle: string; category: string; subtype: string;
  texture: string; lengths: string[]; colors: string[]; origin: string; laceSize: string; laceTypes: string[];
  priceCents: number;
  compareAtPriceCents: number | null; shipsWithin: string; fulfillment: string[];
  seller: string; sellerCode: string; city: string; state: string; available: boolean;
  createdAt: string; imageUrl: string | null;
};
export type DiscoveryParams = {
  query: string; category: string; texture: string; lengths: string[]; colors: string[];
  origin: string; laceSize: string; laceType: string;
  minPriceCents: number | null; maxPriceCents: number | null; shipsWithin: string;
  fulfillment: string; seller: string; availability: string;
  sort: "relevance" | "newest" | "price_asc" | "price_desc"; page: number; pageSize: number;
};
export type DiscoveryResult = { products: DiscoveryProduct[]; total: number; page: number; pageSize: number; totalPages: number };

export function normalizeDiscoveryText(value: string) {
  return String(value || "").toLowerCase().replace(/[\u201d\u2033]/g, '"').replace(/(\d+)\s*(?:inches|inch|in)\b/g, "$1 inch").replace(/"/g, " inch").replace(/\b(?:inches|inch|in)\b/g, "inch").replace(/\binch\s+inch\b/g, "inch").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
const singular = (value: string) => value.endsWith("ies") ? `${value.slice(0, -3)}y` : value.endsWith("s") ? value.slice(0, -1) : value;
const tokens = (value: string) => normalizeDiscoveryText(value).split(" ").filter(Boolean).map(singular);
const matchesList = (values: string[], selected: string[]) => !selected.length || selected.every((v) => values.flatMap(tokens).includes(singular(normalizeDiscoveryText(v))));
function score(product: DiscoveryProduct, query: string) {
  const terms = tokens(query); const fields = [product.title, product.category, product.subtype, product.texture, product.origin, product.laceSize, ...product.laceTypes, ...product.lengths, ...product.colors, product.seller].map(normalizeDiscoveryText);
  return terms.reduce((sum, term) => sum + (fields.some((f) => f.split(" ").includes(term)) ? 2 : fields.some((f) => f.includes(term)) ? 1 : 0), 0);
}

export function parseDiscoveryParams(url: URL): DiscoveryParams {
  const list = (key: string) => (url.searchParams.get(key) || "").split(",").map((v) => v.trim()).filter(Boolean);
  const money = (key: string) => { const raw = url.searchParams.get(key); if (!raw) return null; const n = Number(raw); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
  const sort = url.searchParams.get("sort");
  return { query: url.searchParams.get("q") || "", category: url.searchParams.get("category") || "", texture: url.searchParams.get("texture") || "", origin: url.searchParams.get("origin") || "", laceSize: url.searchParams.get("laceSize") || "", laceType: url.searchParams.get("laceType") || "", lengths: list("length"), colors: list("color"), minPriceCents: money("minPrice"), maxPriceCents: money("maxPrice"), shipsWithin: url.searchParams.get("shipsWithin") || "", fulfillment: url.searchParams.get("fulfillment") || "", seller: url.searchParams.get("seller") || "", availability: url.searchParams.get("availability") || "", sort: sort === "newest" || sort === "price_asc" || sort === "price_desc" ? sort : "relevance", page: Math.max(1, Number(url.searchParams.get("page")) || 1), pageSize: Math.min(48, Math.max(1, Number(url.searchParams.get("pageSize")) || 24)) };
}

export function discoverProducts(products: DiscoveryProduct[], params: DiscoveryParams): DiscoveryResult {
  const category = normalizeDiscoveryText(params.category); const texture = normalizeDiscoveryText(params.texture); const fulfillment = normalizeDiscoveryText(params.fulfillment); const seller = normalizeDiscoveryText(params.seller);
  const origin = normalizeDiscoveryText(params.origin); const laceSize = normalizeDiscoveryText(params.laceSize); const laceType = normalizeDiscoveryText(params.laceType);
  const filtered = products.filter((p) => {
    if (category && normalizeDiscoveryText(p.category) !== category) return false;
    if (texture && !normalizeDiscoveryText(p.texture).includes(texture)) return false;
    if (origin && !normalizeDiscoveryText(p.origin).includes(origin)) return false;
    if (laceSize && !normalizeDiscoveryText(p.laceSize).includes(laceSize)) return false;
    if (laceType && !p.laceTypes.some((value) => normalizeDiscoveryText(value).includes(laceType))) return false;
    if (!matchesList(p.lengths, params.lengths) || !matchesList(p.colors, params.colors)) return false;
    if (params.minPriceCents !== null && p.priceCents < params.minPriceCents) return false;
    if (params.maxPriceCents !== null && p.priceCents > params.maxPriceCents) return false;
    if (params.shipsWithin && normalizeDiscoveryText(p.shipsWithin) !== normalizeDiscoveryText(params.shipsWithin)) return false;
    if (fulfillment && !p.fulfillment.some((v) => normalizeDiscoveryText(v) === fulfillment)) return false;
    if (seller && !normalizeDiscoveryText(p.seller).includes(seller)) return false;
    if (params.availability === "available" && !p.available) return false;
    if (params.availability === "unavailable" && p.available) return false;
    return !params.query || score(p, params.query) >= tokens(params.query).length;
  });
  const sorted = [...filtered].sort((a, b) => params.sort === "price_asc" ? a.priceCents - b.priceCents || a.title.localeCompare(b.title) : params.sort === "price_desc" ? b.priceCents - a.priceCents || a.title.localeCompare(b.title) : params.sort === "newest" ? b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title) : score(b, params.query) - score(a, params.query) || b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title));
  const start = (params.page - 1) * params.pageSize;
  return { products: sorted.slice(start, start + params.pageSize), total: sorted.length, page: params.page, pageSize: params.pageSize, totalPages: Math.max(1, Math.ceil(sorted.length / params.pageSize)) };
}

export function normalizeShopifyDiscoveryProduct(node: any, seller: { businessName: string; sellerCode: string; city: string | null; state: string | null }): DiscoveryProduct {
  const metafields = node.metafields?.nodes || [];
  const parsed = parseAdminProductAttributes({ metafields, tags: node.tags || [] });
  const values = (key: string) => metafields.filter((m: any) => m?.key?.toLowerCase() === key).flatMap((m: any) => { try { const parsedValue = JSON.parse(m.value); return Array.isArray(parsedValue) ? parsedValue : [parsedValue]; } catch { return [m.value]; } }).filter(Boolean).map(String);
  const variants = node.variants?.nodes || []; const prices = variants.map((v: any) => Number(v.price)).filter(Number.isFinite); const compare = variants.map((v: any) => Number(v.compareAtPrice)).filter(Number.isFinite);
  const h = node.hairgrabMetafields?.nodes || [];
  const fulfillment = [parsed.shippingTerritory === "Nationwide" || h.find((m: any) => m.key === "shipping_territory")?.value === "Nationwide" ? "Nationwide Shipping" : "", h.find((m: any) => m.key === "local_pickup_available")?.value === "true" ? "Local Pickup" : "", h.find((m: any) => m.key === "local_delivery_available")?.value === "true" ? "Local Delivery" : ""].filter(Boolean);
  return { id: node.id, title: node.title, handle: node.handle, category: displayProductCategory(node.productType), subtype: values("subtype")[0] || String(parsed.hairCategory || ""), texture: values("texture")[0] || String(parsed.texture || ""), origin: String(parsed.origin || values("origin")[0] || ""), laceSize: String(parsed.laceSize || values("lace_size")[0] || ""), laceTypes: Array.isArray(parsed.laceType) ? parsed.laceType : String(parsed.laceType || "").split(",").map((item) => item.trim()).filter(Boolean), lengths: values("length").length ? values("length") : Array.isArray(parsed.lengths) ? parsed.lengths : [], colors: values("color").length ? values("color") : Array.isArray(parsed.colors) ? parsed.colors : [], priceCents: Math.round((Math.min(...(prices.length ? prices : [0]))) * 100), compareAtPriceCents: compare.length ? Math.round(Math.max(...compare) * 100) : null, shipsWithin: String(parsed.shipsWithin || values("ships_within")[0] || values("ships within")[0] || h.find((m: any) => m.key === "ships_within")?.value || ""), fulfillment, seller: seller.businessName, sellerCode: seller.sellerCode, city: String(parsed.shipsFromCity || seller.city || ""), state: String(parsed.shipsFromState || seller.state || ""), available: variants.some((v: any) => Number(v.inventoryQuantity) > 0), createdAt: node.createdAt || "", imageUrl: node.featuredImage?.url || null };
}
