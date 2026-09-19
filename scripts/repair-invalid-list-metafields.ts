// @ts-ignore Node's TypeScript stripping requires explicit local extensions.
import db from "../app/db.server.ts";
// @ts-ignore
import { unauthenticated } from "../app/shopify.server.ts";
// @ts-ignore
import { ensureRequiredCustomProductMetafieldDefinitions } from "../app/product-metafield-definitions.server.ts";
// @ts-ignore
import { attributesFromTags, parseCapTypeValues, parseDensityValues, parseLaceSizeValues, parseLaceTypeValues, parseListMetafield, parseShipsWithinValues } from "../app/product-attribute-tags.ts";
// @ts-ignore
import { looksLikeJsonListValue, requiredCustomMetafieldType } from "../lib/shopify/required-product-metafields.ts";

type Mode = "dry-run" | "execute";

const LIST_KEYS = ["lace_type", "cap_type", "lace_size", "density", "ships_within"] as const;

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

function parseKey(key: (typeof LIST_KEYS)[number], raw: string, tags: string[]) {
  const fromTags = attributesFromTags(tags);
  if (key === "lace_type") return parseLaceTypeValues(raw || fromTags.laceTypes || fromTags.laceType);
  if (key === "lace_size") return parseLaceSizeValues(raw || fromTags.laceSizes || fromTags.laceSize);
  if (key === "cap_type") return parseCapTypeValues(raw || fromTags.capTypes || fromTags.capType);
  if (key === "density") return parseDensityValues(raw || fromTags.densities || fromTags.density);
  return parseShipsWithinValues(raw || fromTags.shipsWithins || fromTags.shipsWithin);
}

const PRODUCTS_QUERY = `#graphql
query HairGrabRepairListMetafieldProducts($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      tags
      metafields(namespace: "custom", first: 20) {
        nodes { key value type }
      }
    }
  }
}
`;

const SET_METAFIELDS = `#graphql
mutation HairGrabRepairSetListMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key value }
    userErrors { field message }
  }
}
`;

const mode = modeFromArgs();
const shop = readOption("shop") || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;

if (!mode || process.argv.some((value) => value === "--help" || value === "-h")) {
  console.error("Usage: npm run repair-invalid-list-metafields -- --dry-run");
  console.error("       npm run repair-invalid-list-metafields -- --execute");
  console.error("Snapshots custom list attributes, recreates list definitions, and writes JSON arrays so Shopify admin stops flagging invalid Lace Type values.");
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
    const snapshots: Array<{
      id: string;
      title: string;
      values: Record<(typeof LIST_KEYS)[number], string[]>;
    }> = [];
    let cursor: string | null = null;
    let scanned = 0;

    while (true) {
      const response = await admin.graphql(PRODUCTS_QUERY, { variables: { cursor } });
      const json = await response.json();
      if (json?.errors?.length) {
        throw new Error(json.errors.map((error: { message?: string }) => error.message).join(" | "));
      }
      const connection = json?.data?.products;
      for (const node of connection?.nodes || []) {
        if (!node?.id) continue;
        scanned += 1;
        const custom = node.metafields?.nodes || [];
        const values = {} as Record<(typeof LIST_KEYS)[number], string[]>;
        let keep = false;
        for (const key of LIST_KEYS) {
          const raw = String(custom.find((item: { key?: string }) => item.key === key)?.value || "").trim();
          values[key] = parseKey(key, raw, node.tags || []);
          if (looksLikeJsonListValue(raw) || parseListMetafield(raw).length > 1 || values[key].length) keep = true;
        }
        if (keep) snapshots.push({ id: node.id, title: node.title, values });
      }
      if (!connection?.pageInfo?.hasNextPage) break;
      cursor = connection.pageInfo.endCursor;
    }

    console.log(`[${mode}] scanned ${scanned} products; ${snapshots.length} have list-attribute values to restore.`);

    if (mode === "execute") {
      await ensureRequiredCustomProductMetafieldDefinitions(admin, { recreateMismatchedTypes: true });
    } else {
      console.log("[dry-run] would recreate custom.lace_type / cap_type / lace_size / density / ships_within as list.single_line_text_field");
    }

    let updated = 0;
    const failures: Array<{ id: string; reason: string }> = [];
    for (const snapshot of snapshots) {
      const metafields = LIST_KEYS.flatMap((key) => {
        const items = snapshot.values[key];
        if (!items.length) return [];
        const type = requiredCustomMetafieldType(key, "list.single_line_text_field");
        return [{
          ownerId: snapshot.id,
          namespace: "custom",
          key,
          type,
          value: type.startsWith("list.") ? JSON.stringify(items) : items.join(", "),
        }];
      });
      if (!metafields.length) continue;
      console.log(`[${mode}] ${snapshot.title} (${snapshot.id}): ${metafields.map((item) => `${item.key}=${item.value}`).join("; ")}`);
      if (mode !== "execute") {
        updated += 1;
        continue;
      }
      const setResponse = await admin.graphql(SET_METAFIELDS, { variables: { metafields } });
      const setJson = await setResponse.json();
      const errors = [...(setJson?.errors || []), ...(setJson?.data?.metafieldsSet?.userErrors || [])];
      if (errors.length) {
        const reason = errors.map((error: { message?: string }) => error.message).join(" | ");
        failures.push({ id: snapshot.id, reason });
        console.error(`[execute] ${snapshot.id}: ${reason}`);
        continue;
      }
      updated += 1;
    }

    console.log(`[${mode}] restored ${updated}; failed ${failures.length}.`);
    if (failures.length) process.exitCode = 1;
    await db.$disconnect();
  }
}
