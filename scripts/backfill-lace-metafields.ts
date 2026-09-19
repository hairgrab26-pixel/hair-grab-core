// @ts-ignore Node's TypeScript stripping requires explicit local extensions.
import db from "../app/db.server.ts";
// @ts-ignore
import { unauthenticated } from "../app/shopify.server.ts";
// @ts-ignore
import { ensureRequiredCustomProductMetafieldDefinitions, customMetafieldType } from "../app/product-metafield-definitions.server.ts";
// @ts-ignore
import { attributesFromTags, parseLaceTypeValues } from "../app/product-attribute-tags.ts";

type Mode = "dry-run" | "execute";

function readOption(name: string) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length).trim() : null;
}

function modeFromArgs(): Mode | null {
  const dryRun = process.argv.includes("--dry-run");
  const execute = process.argv.includes("--execute");
  if (dryRun === execute) return null;
  return dryRun ? "dry-run" : "execute";
}

function isLaceCategory(productType: string) {
  const normalized = String(productType || "").toLowerCase();
  return normalized.includes("wig") || normalized.includes("closure") || normalized.includes("frontal");
}

function metafieldValue(nodes: Array<{ key?: string; value?: string }>, key: string) {
  return String(nodes.find((item) => String(item.key || "") === key)?.value || "").trim();
}

const PRODUCT_QUERY = `#graphql
query HairGrabBackfillLaceProducts($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id
      title
      productType
      tags
      metafields(first: 30, namespace: "custom") { nodes { key value } }
    }
  }
}
`;

const SET_METAFIELDS = `#graphql
mutation HairGrabBackfillSetMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key }
    userErrors { field message }
  }
}
`;

const mode = modeFromArgs();
const shop = readOption("shop") || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;

if (!mode || process.argv.some((value) => value === "--help" || value === "-h")) {
  console.error("Usage: npm run backfill-lace-metafields -- --dry-run");
  console.error("       npm run backfill-lace-metafields -- --execute");
  console.error("Copies Lace Size / Lace Type / Origin tags onto unconstrained custom.* product metafields for Wigs and Closures.");
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
    const laceTypeType = customMetafieldType(definitions, "lace_type", "list.single_line_text_field");
    const products = await db.sellerProduct.findMany({
      where: { shopifyProductId: { not: null } },
      select: { shopifyProductId: true, title: true },
    });

    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    const failures: Array<{ id: string; reason: string }> = [];

    for (let index = 0; index < products.length; index += 50) {
      const batch = products.slice(index, index + 50);
      const ids = batch.map((item) => item.shopifyProductId).filter((id): id is string => Boolean(id));
      const response = await admin.graphql(PRODUCT_QUERY, { variables: { ids } });
      const json = await response.json();
      if (json?.errors?.length) {
        throw new Error(json.errors.map((error: { message?: string }) => error.message).join(" | "));
      }
      for (const node of json?.data?.nodes || []) {
        if (!node?.id) continue;
        scanned += 1;
        if (!isLaceCategory(node.productType)) {
          skipped += 1;
          continue;
        }
        const fromTags = attributesFromTags(node.tags || []);
        const custom = node.metafields?.nodes || [];
        const next: Array<{ ownerId: string; namespace: string; key: string; type: string; value: string }> = [];
        const origin = fromTags.origin;
        if (origin && !metafieldValue(custom, "origin")) {
          next.push({ ownerId: node.id, namespace: "custom", key: "origin", type: "single_line_text_field", value: origin });
        }
        if (fromTags.laceSize && !metafieldValue(custom, "lace_size")) {
          next.push({ ownerId: node.id, namespace: "custom", key: "lace_size", type: "single_line_text_field", value: fromTags.laceSize });
        }
        const laceTypes = parseLaceTypeValues(fromTags.laceTypes.length ? fromTags.laceTypes : fromTags.laceType);
        if (laceTypes.length && !metafieldValue(custom, "lace_type")) {
          next.push({
            ownerId: node.id,
            namespace: "custom",
            key: "lace_type",
            type: laceTypeType,
            value: laceTypeType.startsWith("list.") ? JSON.stringify(laceTypes) : laceTypes.join(", "),
          });
        }
        if (!next.length) {
          skipped += 1;
          continue;
        }
        console.log(`[${mode}] ${node.title} (${node.id}): ${next.map((item) => `${item.key}=${item.value}`).join("; ")}`);
        if (mode === "execute") {
          const setResponse = await admin.graphql(SET_METAFIELDS, { variables: { metafields: next } });
          const setJson = await setResponse.json();
          const errors = [...(setJson?.errors || []), ...(setJson?.data?.metafieldsSet?.userErrors || [])];
          if (errors.length) {
            const reason = errors.map((error: { message?: string }) => error.message).join(" | ");
            failures.push({ id: node.id, reason });
            console.error(`[execute] ${node.id}: ${reason}`);
            continue;
          }
        }
        updated += 1;
      }
    }

    console.log(`[${mode}] scanned ${scanned}; would-update/updated ${updated}; skipped ${skipped}; failed ${failures.length}.`);
    if (failures.length) process.exitCode = 1;
    await db.$disconnect();
  }
}
