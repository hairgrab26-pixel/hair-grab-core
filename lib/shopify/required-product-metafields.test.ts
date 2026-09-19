import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore
import { REQUIRED_CUSTOM_PRODUCT_METAFIELDS, REQUIRED_METAFIELD_CAPABILITIES, REQUIRED_METAFIELD_STOREFRONT_ACCESS, definitionMatchesRequired } from "./required-product-metafields.ts";

test("requires unconstrained custom Origin, lace, density, cap type, and ships-within definitions", () => {
  assert.deepEqual(
    REQUIRED_CUSTOM_PRODUCT_METAFIELDS.map((item) => item.key),
    ["origin", "lace_size", "lace_type", "density", "cap_type", "ships_within"],
  );
  assert.equal(REQUIRED_CUSTOM_PRODUCT_METAFIELDS.find((item) => item.key === "lace_type")?.type, "list.single_line_text_field");
  assert.equal(REQUIRED_CUSTOM_PRODUCT_METAFIELDS.find((item) => item.key === "density")?.type, "list.single_line_text_field");
  assert.ok(
    definitionMatchesRequired(
      { namespace: "custom", key: "lace_size", constraints: { key: null } },
      { key: "lace_size" },
    ),
  );
  assert.equal(
    definitionMatchesRequired(
      { namespace: "custom", key: "lace_size", constraints: { key: "product_taxonomy_node_id" } },
      { key: "lace_size" },
    ),
    false,
  );
  assert.equal(REQUIRED_METAFIELD_STOREFRONT_ACCESS, "PUBLIC_READ");
  assert.equal(REQUIRED_METAFIELD_CAPABILITIES.adminFilterable.enabled, true);
});
