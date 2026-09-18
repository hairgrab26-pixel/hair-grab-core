import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const REVIEW_IMPORT_POLICY_VERSION = "2026-09-16-v1";
export const REVIEW_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const REVIEW_IMPORT_MAX_ROWS = 10_000;

export const REVIEW_IMPORT_STATUSES = [
  "DRAFT", "VALIDATING", "NEEDS_MAPPING", "READY_FOR_SUBMISSION",
  "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_APPROVED",
  "IMPORTING", "COMPLETED", "REJECTED", "FAILED", "CANCELLED",
] as const;

export type ReviewImportSource = "JUDGEME" | "SHOPIFY_PRODUCT_REVIEWS" | "LOOX" | "YOTPO" | "ETSY" | "AMAZON" | "OTHER_CSV";

type RawRow = Record<string, string>;
export type NormalizedReviewRow = {
  rowNumber: number;
  sourceReviewId: string | null;
  sourceProductIdentifier: string | null;
  sourceProductTitle: string | null;
  rating: number | null;
  reviewTitle: string | null;
  reviewBody: string | null;
  reviewerDisplayName: string | null;
  reviewerEmail: string | null;
  reviewDate: Date | null;
  mediaUrls: string[];
  sourceVerified: boolean | null;
  validationStatus: "VALID" | "WARNING" | "REJECTED" | "DUPLICATE" | "UNMATCHED";
  rejectionReason: string | null;
  warningReason: string | null;
  dedupeFingerprint: string;
};

export type ValidationSummary = {
  source: ReviewImportSource;
  headers: string[];
  rows: NormalizedReviewRow[];
  validCount: number;
  warningCount: number;
  rejectedCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  unsupported: boolean;
  message?: string;
};

const aliases: Record<string, string[]> = {
  sourceReviewId: ["id", "review_id", "review id", "reviewid", "review identifier"],
  sourceProductIdentifier: ["product_id", "product id", "product_handle", "product handle", "handle", "sku", "asin", "listing_id", "listing id"],
  sourceProductTitle: ["product_title", "product title", "product", "product_name", "product name", "title"],
  rating: ["rating", "stars", "star_rating", "star rating", "score"],
  reviewTitle: ["review_title", "review title", "headline", "summary"],
  reviewBody: ["body", "review", "review_body", "review body", "content", "text", "comment"],
  reviewerDisplayName: ["name", "reviewer", "reviewer_name", "reviewer name", "author", "customer_name", "customer name"],
  reviewerEmail: ["email", "reviewer_email", "reviewer email", "customer_email", "customer email"],
  reviewDate: ["created_at", "created at", "date", "review_date", "review date", "published_at", "published at"],
  mediaUrls: ["review_image_urls", "review image urls", "image_urls", "image urls", "photos", "images", "media"],
  sourceVerified: ["verified", "verified_purchase", "verified purchase", "verified_buyer", "verified buyer"],
};

function headerKey(value: string) {
  return value.trim().toLowerCase().replace(/\ufeff/g, "").replace(/[\s-]+/g, "_");
}

function field(row: RawRow, key: keyof typeof aliases) {
  const entries = Object.entries(row);
  const accepted = new Set(aliases[key].map(headerKey));
  return entries.find(([name]) => accepted.has(headerKey(name)))?.[1]?.trim() || "";
}

export function parseCsv(input: string): { headers: string[]; rows: RawRow[] } {
  const text = input.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { current += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(current); current = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current); current = "";
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    current += char;
  }
  if (current !== "" || row.length) { row.push(current); if (row.some(value => value.trim() !== "")) rows.push(row); }
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map(value => value.trim());
  return { headers, rows: rows.slice(1).map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""])) ) };
}

function sanitizeText(value: string) {
  return value.replace(/<[^>]*>/g, "").split("").filter(char => {
    const code = char.charCodeAt(0);
    return code >= 32 || code === 9 || code === 10 || code === 13;
  }).join("").trim().slice(0, 20_000);
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date > new Date() ? null : date;
}

function parseBoolean(value: string) {
  if (!value) return null;
  if (["true", "yes", "1", "verified"].includes(value.toLowerCase())) return true;
  if (["false", "no", "0", "unverified"].includes(value.toLowerCase())) return false;
  return null;
}

function media(value: string) {
  return value.split(/[|,\n]/).map(item => item.trim()).filter(item => /^https?:\/\//i.test(item)).slice(0, 10);
}

function fingerprint(row: Omit<NormalizedReviewRow, "validationStatus" | "rejectionReason" | "warningReason" | "dedupeFingerprint">) {
  const stable = [row.sourceReviewId || "", row.sourceProductIdentifier || "", row.rating ?? "", row.reviewBody || "", row.reviewDate?.toISOString() || "", row.reviewerDisplayName || ""].join("\u001f").toLowerCase();
  return crypto.createHash("sha256").update(stable).digest("hex");
}

export function detectSource(headers: string[]): ReviewImportSource | null {
  const set = new Set(headers.map(headerKey));
  if (set.has("review_id") && (set.has("product_handle") || set.has("product_id"))) return "JUDGEME";
  if (set.has("review_body") && set.has("rating") && set.has("product_id")) return "SHOPIFY_PRODUCT_REVIEWS";
  if (set.has("review_title") && set.has("review_body") && set.has("product_id")) return "LOOX";
  if (set.has("review_content") || set.has("reviewer_name")) return "YOTPO";
  return null;
}

export function normalizeReviews(csv: string, requestedSource: ReviewImportSource): ValidationSummary {
  const parsed = parseCsv(csv);
  if (!parsed.headers.length) return { source: requestedSource, headers: [], rows: [], validCount: 0, warningCount: 0, rejectedCount: 0, duplicateCount: 0, unmatchedCount: 0, unsupported: true, message: "The CSV is empty." };
  const recognized = Object.keys(aliases).filter(key => parsed.headers.some(header => aliases[key].map(headerKey).includes(headerKey(header))));
  if (!recognized.includes("rating") || !recognized.includes("reviewBody")) return { source: requestedSource, headers: parsed.headers, rows: [], validCount: 0, warningCount: 0, rejectedCount: 0, duplicateCount: 0, unmatchedCount: 0, unsupported: true, message: "Map columns for rating and review content before importing." };
  const seen = new Set<string>();
  const rows = parsed.rows.slice(0, REVIEW_IMPORT_MAX_ROWS).map((raw, index) => {
    const ratingRaw = field(raw, "rating");
    const rating = ratingRaw ? Number(ratingRaw) : null;
    const reviewBody = sanitizeText(field(raw, "reviewBody"));
    const reviewTitle = sanitizeText(field(raw, "reviewTitle")) || null;
    const date = parseDate(field(raw, "reviewDate"));
    const base = { rowNumber: index + 2, sourceReviewId: field(raw, "sourceReviewId") || null, sourceProductIdentifier: field(raw, "sourceProductIdentifier") || null, sourceProductTitle: sanitizeText(field(raw, "sourceProductTitle")) || null, rating: Number.isFinite(rating) ? rating : null, reviewTitle, reviewBody: reviewBody || null, reviewerDisplayName: sanitizeText(field(raw, "reviewerDisplayName")) || null, reviewerEmail: field(raw, "reviewerEmail") || null, reviewDate: date, mediaUrls: media(field(raw, "mediaUrls")), sourceVerified: parseBoolean(field(raw, "sourceVerified")) };
    const dedupeFingerprint = fingerprint(base);
    const errors: string[] = [];
    if (base.rating === null || base.rating < 1 || base.rating > 5) errors.push("Rating must be between 1 and 5.");
    if (!base.reviewBody || base.reviewBody.length < 3) errors.push("Review content is required.");
    if (field(raw, "reviewDate") && !base.reviewDate) errors.push("Review date is invalid or in the future.");
    if (!base.sourceProductIdentifier && !base.sourceProductTitle) errors.push("A source product identifier or title is required.");
    const duplicate = seen.has(dedupeFingerprint);
    seen.add(dedupeFingerprint);
    const status = errors.length ? "REJECTED" : duplicate ? "DUPLICATE" : "UNMATCHED";
    return { ...base, dedupeFingerprint, validationStatus: status as NormalizedReviewRow["validationStatus"], rejectionReason: errors.join(" ") || (duplicate ? "Duplicate review in this file." : null), warningReason: status === "UNMATCHED" ? "Product mapping is required before submission." : null };
  });
  return { source: requestedSource, headers: parsed.headers, rows, validCount: rows.filter(row => row.validationStatus === "VALID").length, warningCount: rows.filter(row => row.validationStatus === "WARNING").length, rejectedCount: rows.filter(row => row.validationStatus === "REJECTED").length, duplicateCount: rows.filter(row => row.validationStatus === "DUPLICATE").length, unmatchedCount: rows.filter(row => row.validationStatus === "UNMATCHED").length, unsupported: false };
}

export function suggestProductMatch(row: { sourceProductIdentifier?: string | null; sourceProductTitle?: string | null }, products: Array<{ id: string; title: string; shopifyProductId: string | null; shopifyHandle: string | null }>) {
  const identifier = (row.sourceProductIdentifier || "").trim().toLowerCase();
  const title = (row.sourceProductTitle || "").trim().toLowerCase();
  return products.find(product => [product.shopifyProductId, product.shopifyHandle].filter(Boolean).some(value => value!.toLowerCase() === identifier))
    || products.find(product => title && product.title.trim().toLowerCase() === title)
    || null;
}

export function judgeMeCsv(rows: Array<{ reviewerEmail?: string | null; reviewerDisplayName?: string | null; reviewTitle?: string | null; reviewBody?: string | null; rating?: number | null; reviewDate?: Date | null; sellerProduct?: { shopifyHandle: string | null } | null; mediaUrls?: unknown }>) {
  const escape = (value: string) => { const safe = /^[=+@-]/.test(value) ? `'${value}` : value; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const formatDate = (date: Date | null | undefined) => date ? `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}` : "";
  const header = "title,body,rating,review_date,reviewer_name,reviewer_email,product_handle,picture_urls,curated";
  const lines = rows.map(row => [row.reviewTitle || "", row.reviewBody || "", row.rating ?? "", formatDate(row.reviewDate), row.reviewerDisplayName || "", row.reviewerEmail || "", row.sellerProduct?.shopifyHandle || "", Array.isArray(row.mediaUrls) ? row.mediaUrls.join(",") : "", "not-yet"].map(value => escape(String(value))).join(","));
  return [header, ...lines].join("\n");
}

export async function storeReviewImportFile(sellerId: string, file: File, contents: string) {
  if (file.size > REVIEW_IMPORT_MAX_BYTES) throw new Error("The CSV exceeds the 10 MB limit.");
  const hash = crypto.createHash("sha256").update(contents).digest("hex");
  const root = process.env.REVIEW_IMPORT_STORAGE_DIR || path.join(process.cwd(), ".private-review-imports");
  const key = `${sellerId}/${hash}.csv`;
  const target = path.join(root, sellerId, `${hash}.csv`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, { encoding: "utf8", flag: "wx" }).catch(error => { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; });
  return { hash, key };
}
