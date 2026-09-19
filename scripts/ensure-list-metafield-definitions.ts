// @ts-ignore Node's TypeScript stripping requires explicit local extensions.
import db from "../app/db.server.ts";
// @ts-ignore
import { unauthenticated } from "../app/shopify.server.ts";
// @ts-ignore
import { ensureRequiredCustomProductMetafieldDefinitions } from "../app/product-metafield-definitions.server.ts";
// @ts-ignore
import { REQUIRED_CUSTOM_PRODUCT_METAFIELDS, requiredCustomMetafieldType } from "../lib/shopify/required-product-metafields.ts";

const LIST_KEYS = ["lace_type", "cap_type", "lace_size", "density", "ships_within"] as const;

const shop = process.argv.find((value) => value.startsWith("--shop="))?.slice("--shop=".length).trim()
  || process.env.SHOPIFY_SHOP
  || process.env.SHOPIFY_STORE_DOMAIN;

if (process.argv.some((value) => value === "--help" || value === "-h")) {
  console.error("Usage: npm run ensure-list-metafield-definitions");
  console.error("Creates or recreates custom list product metafield definitions and enables storefront read.");
  process.exitCode = 1;
} else {
  const offline = await db.session.findFirst({
    where: shop ? { isOnline: false, shop } : { isOnline: false },
  });
  if (!offline) {
    console.error("No Shopify offline session found.");
    process.exitCode = 1;
  } else {
    const { admin } = await unauthenticated.admin(offline.shop);
    const definitions = await ensureRequiredCustomProductMetafieldDefinitions(admin);
    for (const key of LIST_KEYS) {
      const expected = requiredCustomMetafieldType(key, "list.single_line_text_field");
      const match = definitions.find((item) => item.namespace === "custom" && item.key === key && !item.constraints?.key);
      const actual = match?.type?.name || "missing";
      const storefront = (match as { access?: { storefront?: string } } | undefined)?.access?.storefront || "unknown";
      console.log(`custom.${key}: type=${actual} expected=${expected} storefront=${storefront}`);
      if (actual !== expected) process.exitCode = 1;
    }
    for (const spec of REQUIRED_CUSTOM_PRODUCT_METAFIELDS) {
      if (LIST_KEYS.includes(spec.key as (typeof LIST_KEYS)[number])) continue;
      const match = definitions.find((item) => item.namespace === "custom" && item.key === spec.key && !item.constraints?.key);
      console.log(`custom.${spec.key}: type=${match?.type?.name || "missing"}`);
    }
    await db.$disconnect();
  }
}
