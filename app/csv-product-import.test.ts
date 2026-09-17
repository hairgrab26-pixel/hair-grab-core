import assert from "node:assert/strict";
import test from "node:test";
import {
  inferProductDetailsFromTitle,
  parseCsvText,
  resolveCsvProductFields,
  resolveStructuredMaterial,
  resolveStructuredPieceCount,
  resolveStructuredProductType,
  resolveStructuredTexture,
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
} from "./csv-product-import.ts";

test("parseCsvText handles quoted commas and embedded newlines (unchanged from the original inline parser)", () => {
  const rows = parseCsvText('Title,Description\n"Wig, 24in","Line one\nline two"\n');
  assert.deepEqual(rows, [
    ["Title", "Description"],
    ["Wig, 24in", "Line one\nline two"],
  ]);
});

test("an explicit, valid structured category column wins over anything the title implies", () => {
  const resolved = resolveCsvProductFields("Body Wave Bundle Deal", { productType: "Wigs" });
  assert.equal(resolved.productType.value, "WIG");
  assert.equal(resolved.productType.source, "structured");
  assert.ok(!resolved.needsConfirmation.includes("productType"));
});

test("an unrecognized structured value is flagged as a row error, not silently dropped, and not replaced by a guess", () => {
  const resolved = resolveCsvProductFields("Body Wave Bundle Deal", { productType: "Hats" });
  assert.equal(resolved.productType.value, "");
  assert.equal(resolved.productType.source, "invalid");
  assert.equal(resolved.productType.rawValue, "Hats");
  assert.ok(!resolved.needsConfirmation.includes("productType"));
  assert.ok(resolved.errors.some((message) => message.includes("Hats")));
});

test("with no structured column at all, title inference fills the field but is flagged needsConfirmation", () => {
  const resolved = resolveCsvProductFields("13x4 HD Lace Frontal Wig", {});
  assert.equal(resolved.productType.value, "WIG");
  assert.equal(resolved.productType.source, "inferred");
  assert.ok(resolved.needsConfirmation.includes("productType"));
});

test("a wrong-but-plausible inference still requires confirmation -- it cannot silently pass as ready", () => {
  // Title mentions both "bundle" and "wig"-adjacent words; inference
  // will pick one guess, but regardless of which, it must never come
  // back without needsConfirmation when there's no structured column.
  const resolved = resolveCsvProductFields("Wig Cap Bundle Deal 100g", {});
  assert.ok(resolved.needsConfirmation.length > 0, "some field was inferred and must require confirmation");
});

test("structured texture and material validate against the same controlled lists the product form uses", () => {
  assert.equal(resolveStructuredTexture("body wave"), "Body Wave");
  assert.equal(resolveStructuredTexture("Bodywave"), "Body Wave");
  assert.equal(resolveStructuredTexture("Wavy"), null);
  assert.equal(resolveStructuredMaterial("human hair"), "Human Hair");
  assert.equal(resolveStructuredMaterial("remy"), null);
});

test("resolveStructuredProductType tolerates enum text, label text, and case/spacing drift", () => {
  assert.equal(resolveStructuredProductType("WIG"), "WIG");
  assert.equal(resolveStructuredProductType("Wigs"), "WIG");
  assert.equal(resolveStructuredProductType("closures & frontals"), "CLOSURE_FRONTAL");
  assert.equal(resolveStructuredProductType("Braids + Crochet"), "BRAIDING_HAIR");
  assert.equal(resolveStructuredProductType("Braiding Hair"), "BRAIDING_HAIR");
  assert.equal(resolveStructuredProductType("Nail Polish"), null);
});

test("a row with only a structured texture and no structured category still infers category but flags only that field", () => {
  const resolved = resolveCsvProductFields("24 inch Body Wave Bundle", { texture: "Body Wave" });
  assert.equal(resolved.texture.source, "structured");
  assert.ok(!resolved.needsConfirmation.includes("texture"));
  assert.equal(resolved.productType.source, "inferred");
  assert.ok(resolved.needsConfirmation.includes("productType"));
});

test("inferProductDetailsFromTitle recognizes the new Topper/Sew-In extension methods added in Phase 2A", () => {
  assert.equal(inferProductDetailsFromTitle("Human Hair Topper 12in").productOption, "TOPPER");
  assert.equal(inferProductDetailsFromTitle("Sew-In Extensions 18in").productOption, "SEW_IN");
});

test("a title with no recognizable signal at all resolves to missing, not a wrong guess", () => {
  const resolved = resolveCsvProductFields("Assorted Accessory Pack", {});
  assert.equal(resolved.productType.source, "missing");
  assert.equal(resolved.texture.source, "missing");
});

// ----------------------------------------------------------
// Safety-review fix: pieceCount has no fixed choice list, so any
// exact positive whole number must be accepted -- including counts
// above what a small dropdown would have listed (HairGrab already
// sells 7-piece sets, which a "1".."5+" list would have collapsed).
// ----------------------------------------------------------

test("resolveStructuredPieceCount accepts any exact positive whole number, with no upper bound", () => {
  assert.equal(resolveStructuredPieceCount("7"), "7");
  assert.equal(resolveStructuredPieceCount("12"), "12");
  assert.equal(resolveStructuredPieceCount(" 7 "), "7");
});

test("resolveStructuredPieceCount rejects non-exact or malformed values instead of guessing", () => {
  assert.equal(resolveStructuredPieceCount("10+"), null);
  assert.equal(resolveStructuredPieceCount("many"), null);
  assert.equal(resolveStructuredPieceCount("7.5"), null);
  assert.equal(resolveStructuredPieceCount("0"), null);
  assert.equal(resolveStructuredPieceCount("-2"), null);
  assert.equal(resolveStructuredPieceCount(""), null);
});

test("a structured pieceCount of 7 is preserved exactly, not collapsed into a bucket", () => {
  const resolved = resolveCsvProductFields("Clip-In Extensions 7pc", { productType: "Extensions", pieceCount: "7" });
  assert.equal(resolved.pieceCount.value, "7");
  assert.equal(resolved.pieceCount.source, "structured");
  assert.ok(!resolved.needsConfirmation.includes("pieceCount"));
});

test("an unrecognized structured pieceCount is a row error, never silently dropped or rounded to a nearby value", () => {
  const resolved = resolveCsvProductFields("Clip-In Extensions", { pieceCount: "10+" });
  assert.equal(resolved.pieceCount.value, "");
  assert.equal(resolved.pieceCount.source, "invalid");
  assert.equal(resolved.pieceCount.rawValue, "10+");
  assert.ok(resolved.errors.some((message) => message.includes("10+")));
});

test("pieceCount is never inferred from the title -- no structured column means missing, not a guess", () => {
  const resolved = resolveCsvProductFields("Clip-In Extensions 7 Piece Set", {});
  assert.equal(resolved.pieceCount.source, "missing");
  assert.ok(!resolved.needsConfirmation.includes("pieceCount"));
});
