import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore
import { REQUIRED_CUSTOM_PRODUCT_METAFIELDS, definitionMatchesRequired } from "./required-product-metafields.ts";

test("requires unconstrained custom Origin, Lace Size, and Lace Type product definitions", () => {
  assert.deepEqual(
    REQUIRED_CUSTOM_PRODUCT_METAFIELDS.map((item) => item.key),
    ["origin", "lace_size", "lace_type"],
  );
  assert.equal(REQUIRED_CUSTOM_PRODUCT_METAFIELDS.find((item) => item.key === "lace_type")?.type, "list.single_line_text_field");
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
});
