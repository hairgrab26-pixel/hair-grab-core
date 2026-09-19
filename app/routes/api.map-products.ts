import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { buildMapProductsGeoJson, parseBuyerLocation, type MapProductInput } from "../map-products.server";
import { normalizeShopifyDiscoveryProduct } from "../product-discovery.server";
import { configuredSameDayRadiusMiles } from "../same-day-radius";

const PRODUCT_QUERY = `#graphql
query HairGrabMapProducts($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id title handle productType createdAt
      featuredImage { url altText }
      metafields(first: 50, namespace: "custom") { nodes { key value } }
      hairgrabMetafields: metafields(first: 50, namespace: "hairgrab") { nodes { key value } }
      tags
      variants(first: 100) { nodes { price compareAtPrice inventoryQuantity } }
    }
  }
}`;

type CachedPoint = { latitude: number; longitude: number } | null;
const postalCache = new Map<string, CachedPoint>();

function corsOrigin(request: Request) {
  const origin = request.headers.get("Origin") || "";
  return origin === "https://hairgrab.com" || origin === "https://www.hairgrab.com" ? origin : "https://hairgrab.com";
}

async function geocodePostal(country: string, postalCode: string): Promise<CachedPoint> {
  const countryCode = ["US", "USA", "UNITED STATES"].includes(country.trim().toUpperCase()) ? "us" : "";
  const zip = postalCode.replace(/\s+/g, "").slice(0, 5);
  if (countryCode !== "us" || !/^\d{5}$/.test(zip)) return null;
  if (postalCache.has(zip)) return postalCache.get(zip) || null;
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      postalCache.set(zip, null);
      return null;
    }
    const json = await response.json() as { places?: Array<{ latitude?: string; longitude?: string }> };
    const place = json.places?.[0];
    const latitude = Number(place?.latitude);
    const longitude = Number(place?.longitude);
    const point = Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
    postalCache.set(zip, point);
    return point;
  } catch {
    postalCache.set(zip, null);
    return null;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const allowedOrigin = corsOrigin(request);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
  };
  const buyer = parseBuyerLocation(new URL(request.url));
  const radiusMiles = configuredSameDayRadiusMiles();
  const empty = buildMapProductsGeoJson([], buyer, radiusMiles);

  const sellerProducts = await db.sellerProduct.findMany({
    where: { status: "ACTIVE", shopifyProductId: { not: null }, seller: { status: "ACTIVE" } },
    select: {
      shopifyProductId: true,
      seller: {
        select: {
          businessName: true,
          sellerCode: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      },
    },
  });
  const offline = await db.session.findFirst({ where: { isOnline: false } });
  if (!offline || !sellerProducts.length) {
    return new Response(JSON.stringify(empty), { headers });
  }

  const { admin } = await unauthenticated.admin(offline.shop);
  const nodes: any[] = [];
  for (let i = 0; i < sellerProducts.length; i += 100) {
    const ids = sellerProducts.slice(i, i + 100).map((item) => item.shopifyProductId).filter((id): id is NonNullable<typeof id> => Boolean(id));
    const response = await admin.graphql(PRODUCT_QUERY, { variables: { ids } });
    const data = await response.json();
    nodes.push(...(data.data?.nodes || []).filter(Boolean));
  }

  const uniquePostals = [...new Set(sellerProducts.map((item) => `${item.seller.country || "US"}|${item.seller.postalCode || ""}`))];
  const points = new Map<string, CachedPoint>();
  await Promise.all(uniquePostals.map(async (key) => {
    const [country, postal] = key.split("|");
    points.set(key, await geocodePostal(country, postal));
  }));

  const sellerByProduct = new Map(sellerProducts.map((item) => [item.shopifyProductId, item.seller]));
  const products: MapProductInput[] = [];
  for (const node of nodes) {
    const seller = sellerByProduct.get(node.id);
    if (!seller) continue;
    const discovered = normalizeShopifyDiscoveryProduct(node, seller);
    const metafields = [...(node.metafields?.nodes || []), ...(node.hairgrabMetafields?.nodes || [])];
    const showOnMap = metafields.find((item: any) => String(item.key || "").toLowerCase() === "show_on_hairgrab_map")?.value;
    const sameDayDelivery = metafields.find((item: any) => String(item.key || "").toLowerCase() === "same_day_delivery")?.value === "true";
    const point = points.get(`${seller.country || "US"}|${seller.postalCode || ""}`) || null;
    products.push({
      id: discovered.id,
      title: discovered.title,
      handle: discovered.handle,
      imageUrl: discovered.imageUrl,
      priceCents: discovered.priceCents,
      seller: discovered.seller,
      sellerCode: discovered.sellerCode,
      city: discovered.city,
      state: discovered.state,
      shipsWithin: discovered.shipsWithin,
      tags: node.tags || [],
      sameDayDelivery,
      showOnMap: showOnMap ? /^(yes|true|1)$/i.test(String(showOnMap)) : true,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
    });
  }

  return new Response(JSON.stringify(buildMapProductsGeoJson(products, buyer, radiusMiles)), { headers });
}
