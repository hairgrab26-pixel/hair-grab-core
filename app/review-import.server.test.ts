import test from "node:test";
import assert from "node:assert/strict";
import { detectSource, judgeMeCsv, normalizeReviews, parseCsv, suggestProductMatch } from "./review-import.server";

test("parses quoted CSV and preserves negative reviews", () => {
  const csv = 'review_id,product_handle,rating,body,created_at\n42,bob-wig,1,"Needs improvement, but honest",2026-09-01';
  const result = normalizeReviews(csv, "JUDGEME");
  assert.equal(result.rows[0].rating, 1);
  assert.equal(result.rows[0].reviewBody, "Needs improvement, but honest");
  assert.equal(result.rows[0].validationStatus, "UNMATCHED");
});

test("rejects invalid ratings, future dates, and formula values are escaped on export", () => {
  const result = normalizeReviews('product_handle,rating,body,created_at\nbob,7,=SUM(A1),2099-01-01', "OTHER_CSV");
  assert.equal(result.rejectedCount, 1);
  const csv = judgeMeCsv([{ reviewerDisplayName: "=attacker", reviewBody: "=cmd", rating: 5, reviewDate: new Date("2026-01-01"), sellerProduct: { shopifyHandle: "bob" } }]);
  assert.match(csv, /'=attacker/);
  assert.match(csv, /'=cmd/);
});

test("detects duplicates deterministically and suggests only exact product matches", () => {
  const result = normalizeReviews('id,product_handle,rating,body,date\n1,bob,5,great,2026-01-01\n1,bob,5,great,2026-01-01', "JUDGEME");
  assert.equal(result.duplicateCount, 1);
  const suggestion = suggestProductMatch({ sourceProductIdentifier: "bob" }, [{ id: "p1", title: "Bob", shopifyProductId: null, shopifyHandle: "bob" }]);
  assert.equal(suggestion?.id, "p1");
});

test("unsupported or incomplete headers require guided mapping", () => {
  assert.equal(detectSource(["foo", "bar"]), null);
  const result = normalizeReviews("foo,bar\na,b", "OTHER_CSV");
  assert.equal(result.unsupported, true);
});

test("CSV parser handles CRLF and BOM", () => {
  const result = parseCsv("\ufeffrating,body\r\n5,hello\r\n");
  assert.deepEqual(result.rows, [{ rating: "5", body: "hello" }]);
});
