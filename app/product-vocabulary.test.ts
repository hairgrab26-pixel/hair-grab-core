import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HAIR_COLOR,
  normalizeHairColor,
  normalizeHairColors,
} from "./product-vocabulary.ts";

test("maps Natural / 1B and 1B to Natural Black / 1B", () => {
  assert.equal(normalizeHairColor("Natural / 1B"), DEFAULT_HAIR_COLOR);
  assert.equal(normalizeHairColor("1B"), DEFAULT_HAIR_COLOR);
  assert.equal(normalizeHairColor("natural black / 1b"), DEFAULT_HAIR_COLOR);
  assert.deepEqual(normalizeHairColors(["1B", "Natural / 1B", "613 - Blonde"]), [
    DEFAULT_HAIR_COLOR,
    "613 - Blonde",
  ]);
});
