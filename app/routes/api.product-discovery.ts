import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { discoverProducts, normalizeShopifyDiscoveryProduct, parseDiscoveryParams } from "../product-discovery.server";

const PRODUCT_QUERY = `#graphql
query HairGrabDiscoveryProducts($ids: [ID!]!) {
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

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = origin === "https://hairgrab.com" || origin === "https://www.hairgrab.com" ? origin : "https://hairgrab.com";
  const sellerProducts = await db.sellerProduct.findMany({ where: { status: "ACTIVE", shopifyProductId: { not: null }, seller: { status: "ACTIVE" } }, select: { shopifyProductId: true, seller: { select: { businessName: true, sellerCode: true, city: true, state: true } } } });
  const offline = await db.session.findFirst({ where: { isOnline: false } });
  if (!offline || !sellerProducts.length) return new Response(JSON.stringify({ products: [], total: 0, page: 1, pageSize: 24, totalPages: 1 }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin } });
  const { admin } = await unauthenticated.admin(offline.shop);
  const nodes: any[] = [];
  for (let i = 0; i < sellerProducts.length; i += 100) {
    const ids = sellerProducts.slice(i, i + 100).map((p) => p.shopifyProductId).filter((product): product is NonNullable<typeof product> => Boolean(product));
    const response = await admin.graphql(PRODUCT_QUERY, { variables: { ids } });
    const data = await response.json();
    nodes.push(...(data.data?.nodes || []).filter(Boolean));
  }
  const sellerByProduct = new Map(sellerProducts.map((p) => [p.shopifyProductId, p.seller]));
  const products = nodes.map((node) => { const seller = sellerByProduct.get(node.id); return seller ? normalizeShopifyDiscoveryProduct(node, seller) : null; }).filter((product): product is NonNullable<typeof product> => Boolean(product));
  const result = discoverProducts(products, parseDiscoveryParams(url));
  return new Response(JSON.stringify({
    ...result,
    mapProducts: result.products.map((p) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      city: p.city,
      state: p.state,
      seller: p.seller,
      priceCents: p.priceCents,
      imageUrl: p.imageUrl,
      shipsWithin: p.shipsWithin,
      isSameDayProduct: /same\s*-?\s*day/i.test(p.shipsWithin),
    })),
  }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30, stale-while-revalidate=120", "Access-Control-Allow-Origin": allowedOrigin, "Vary": "Origin" } });
}

