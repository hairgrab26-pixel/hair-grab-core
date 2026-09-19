// @ts-ignore Node's TypeScript stripping requires explicit local extensions.
import db from "../app/db.server.ts";
// @ts-ignore
import { unauthenticated } from "../app/shopify.server.ts";
// @ts-ignore
import { ensureRequiredCustomProductMetafieldDefinitions, customMetafieldType } from "../app/product-metafield-definitions.server.ts";
// @ts-ignore
import { attributesFromTags } from "../app/product-attribute-tags.ts";
// @ts-ignore
import { normalizeHairColors } from "../app/product-vocabulary.ts";

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

function metafieldValue(nodes: Array<{ key?: string; value?: string }>, key: string) {
  return String(nodes.find((item) => String(item.key || "") === key)?.value || "").trim();
}

function parseStoredColors(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    if (parsed != null && parsed !== "") return [String(parsed).trim()];
  } catch {
    // plain text
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function sameColorList(left: string[], right: string[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const PRODUCT_QUERY = `#graphql
query HairGrabBackfillColorProducts($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id
      title
      status
      tags
      metafields(first: 30, namespace: "custom") { nodes { key value } }
      options { name optionValues { name } }
      variants(first: 100) {
        nodes {
          selectedOptions { name value }
        }
      }
    }
  }
}
`;

const SET_METAFIELDS = `#graphql
mutation HairGrabBackfillSetColorMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key value }
    userErrors { field message }
  }
}
`;

const mode = modeFromArgs();
const shop = readOption("shop") || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;

if (!mode || process.argv.some((value) => value === "--help" || value === "-h")) {
  console.error("Usage: npm run backfill-color-metafields -- --dry-run");
  console.error("       npm run backfill-color-metafields -- --execute");
  console.error("Copies variant Color option values onto custom.color product metafields using Natural Black / 1B.");
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
    const colorType = customMetafieldType(definitions, "color", "list.single_line_text_field");
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
        if (String(node.status || "").toUpperCase() !== "ACTIVE") {
          skipped += 1;
          continue;
        }
        const optionColors = (node.options || [])
          .filter((option: { name?: string }) => /^colou?r$/i.test(String(option.name || "")))
          .flatMap((option: { optionValues?: Array<{ name?: string }> }) =>
            (option.optionValues || []).map((value) => String(value.name || "").trim()),
          );
        const variantColors = (node.variants?.nodes || []).flatMap((variant: { selectedOptions?: Array<{ name?: string; value?: string }> }) =>
          (variant.selectedOptions || [])
            .filter((option) => /^colou?r$/i.test(String(option.name || "")))
            .map((option) => String(option.value || "").trim()),
        );
        const fromTags = attributesFromTags(node.tags || []);
        const colors = normalizeHairColors(
          optionColors.length ? optionColors : variantColors.length ? variantColors : fromTags.colors,
        );
        if (!colors.length) {
          skipped += 1;
          continue;
        }
        const current = normalizeHairColors(parseStoredColors(metafieldValue(node.metafields?.nodes || [], "color")));
        if (sameColorList(current, colors)) {
          skipped += 1;
          continue;
        }
        const metafields = [{
          ownerId: node.id,
          namespace: "custom",
          key: "color",
          type: colorType,
          value: colorType.startsWith("list.") ? JSON.stringify(colors) : colors.join(", "),
        }];
        if (mode === "dry-run") {
          console.log(`[dry-run] ${node.title} ${node.id} -> ${JSON.stringify(colors)}`);
          updated += 1;
          continue;
        }
        const setResponse = await admin.graphql(SET_METAFIELDS, { variables: { metafields } });
        const setJson = await setResponse.json();
        const errors = [
          ...(setJson?.errors || []),
          ...(setJson?.data?.metafieldsSet?.userErrors || []),
        ];
        if (errors.length) {
          failures.push({
            id: node.id,
            reason: errors.map((error: { message?: string }) => error.message).join(" | "),
          });
          continue;
        }
        updated += 1;
      }
    }

    console.log(`[${mode}] scanned ${scanned}; would-update/updated ${updated}; skipped ${skipped}; failed ${failures.length}.`);
    if (failures.length) {
      for (const failure of failures) console.error(`${failure.id}: ${failure.reason}`);
      process.exitCode = 1;
    }
    await db.$disconnect();
  }
}
