import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORY_ATTRIBUTE_FIELDS,
  categoryShowsAttribute,
} from "./product-attribute-schema.ts";

test("every hair category has a storefront attribute set", () => {
  assert.deepEqual(Object.keys(CATEGORY_ATTRIBUTE_FIELDS).sort(), [
    "BRAIDING_HAIR",
    "BUNDLE",
    "CLOSURE_FRONTAL",
    "EXTENSION",
    "HAIR_ESSENTIAL",
    "WIG",
  ]);
  assert.equal(categoryShowsAttribute("WIG", "density"), true);
  assert.equal(categoryShowsAttribute("WIG", "capType"), true);
  assert.equal(categoryShowsAttribute("BUNDLE", "weight"), true);
  assert.equal(categoryShowsAttribute("BUNDLE", "origin"), true);
  assert.equal(categoryShowsAttribute("BUNDLE", "weftType"), true);
  assert.equal(categoryShowsAttribute("BUNDLE", "density"), false);
  assert.equal(categoryShowsAttribute("EXTENSION", "extensionType"), true);
  assert.equal(categoryShowsAttribute("EXTENSION", "weight"), true);
  assert.equal(categoryShowsAttribute("BRAIDING_HAIR", "styleType"), true);
  assert.equal(categoryShowsAttribute("CLOSURE_FRONTAL", "laceSize"), true);
  assert.equal(categoryShowsAttribute("HAIR_ESSENTIAL", "texture"), false);
});
