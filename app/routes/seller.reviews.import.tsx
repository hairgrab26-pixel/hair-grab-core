import crypto from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import db from "../db.server";
import { requireSellerSession } from "../seller-session.server";
import { REVIEW_IMPORT_MAX_BYTES, REVIEW_IMPORT_MAX_ROWS, REVIEW_IMPORT_POLICY_VERSION, normalizeReviews, storeReviewImportFile, type ReviewImportSource } from "../review-import.server";

const sources: ReviewImportSource[] = ["JUDGEME", "SHOPIFY_PRODUCT_REVIEWS", "LOOX", "YOTPO", "ETSY", "AMAZON", "OTHER_CSV"];

export async function loader({ request }: LoaderFunctionArgs) {
  const { seller } = await requireSellerSession(request);
  const selectedId = new URL(request.url).searchParams.get("id");
  const [products, imports] = await Promise.all([
    db.$queryRaw<Array<{ id: string; title: string; shopifyHandle: string | null }>>`SELECT "id", "title", "shopifyHandle" FROM "SellerProduct" WHERE "sellerId" = ${seller.id} AND "status" = 'ACTIVE' ORDER BY "title" ASC`,
    db.$queryRaw<Array<{ id: string; sourcePlatform: string; originalFileName: string; status: string; validCount: number; rejectedCount: number; unmatchedCount: number; createdAt: Date }>>`SELECT "id", "sourcePlatform", "originalFileName", "status", "validCount", "rejectedCount", "unmatchedCount", "createdAt" FROM "ReviewImport" WHERE "sellerId" = ${seller.id} ORDER BY "createdAt" DESC LIMIT 25`,
  ]);
  const rows = selectedId ? await db.$queryRaw<Array<{ id: string; sourceProductIdentifier: string | null; sourceProductTitle: string | null; sellerProductId: string | null; rating: number | null; reviewBody: string | null; validationStatus: string; rejectionReason: string | null }>>`
    SELECT rr."id",rr."sourceProductIdentifier",rr."sourceProductTitle",rr."sellerProductId",rr."rating",rr."reviewBody",rr."validationStatus",rr."rejectionReason"
    FROM "ReviewImportRow" rr JOIN "ReviewImport" ri ON ri."id"=rr."importId"
    WHERE rr."importId"=${selectedId} AND ri."sellerId"=${seller.id}
    ORDER BY rr."rowNumber" ASC
  ` : [];
  return { products, imports, rows, selectedId, sources, maxBytes: REVIEW_IMPORT_MAX_BYTES, maxRows: REVIEW_IMPORT_MAX_ROWS };
}

export async function action({ request }: ActionFunctionArgs) {
  const { seller, portalAccount } = await requireSellerSession(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "upload");
  if (intent === "map") {
    const importId = String(form.get("importId") || "");
    const sourceIdentifier = String(form.get("sourceProductIdentifier") || "").trim();
    const sellerProductId = String(form.get("sellerProductId") || "").trim();
    const owned = await db.$queryRaw<Array<{ id: string }>>`SELECT r."id" FROM "ReviewImport" r JOIN "SellerProduct" p ON p."sellerId"=r."sellerId" WHERE r."id"=${importId} AND r."sellerId"=${seller.id} AND p."id"=${sellerProductId}`;
    if (!sourceIdentifier || !owned.length) return { success: false, message: "Choose one of your products and a source product." };
    await db.$executeRaw`UPDATE "ReviewImportRow" SET "sellerProductId"=${sellerProductId}, "validationStatus"=CASE WHEN "validationStatus" IN ('UNMATCHED','WARNING') THEN 'VALID' ELSE "validationStatus" END, "updatedAt"=NOW() WHERE "importId"=${importId} AND COALESCE("sourceProductIdentifier","sourceProductTitle")=${sourceIdentifier}`;
    await db.$executeRaw`UPDATE "ReviewImport" SET "status"='READY_FOR_SUBMISSION', "updatedAt"=NOW() WHERE "id"=${importId} AND "sellerId"=${seller.id}`;
    return { success: true, message: "Product mapping saved." };
  }
  if (intent === "submit") {
    const importId = String(form.get("importId") || "");
    const certification = form.get("certification") === "on";
    if (!importId || !certification) return { success: false, message: "Accept the authenticity certification before submitting." };
    const updated = await db.$executeRaw`
      UPDATE "ReviewImport" SET "status" = 'SUBMITTED', "certificationAccepted" = true,
      "certificationPolicyVersion" = ${REVIEW_IMPORT_POLICY_VERSION}, "certifiedAt" = NOW(),
      "certifiedByPortalAccountId" = ${portalAccount.id}, "submittedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${importId} AND "sellerId" = ${seller.id} AND "status" IN ('DRAFT','READY_FOR_SUBMISSION')
    `;
    if (!updated) return { success: false, message: "Import not found or no longer editable." };
    await db.$executeRaw`INSERT INTO "ReviewImportEvent" ("id","importId","toStatus","actorType","actorId","createdAt") VALUES (${crypto.randomUUID()},${importId},'SUBMITTED','SELLER',${seller.id},NOW())`;
    return { success: true, message: "Review import submitted for HairGrab review." };
  }

  const file = form.get("file");
  const source = String(form.get("sourcePlatform") || "OTHER_CSV") as ReviewImportSource;
  const selectedProductId = String(form.get("sellerProductId") || "");
  if (!(file instanceof File) || file.size === 0 || file.type && file.type !== "text/csv" && !file.name.toLowerCase().endsWith(".csv")) return { success: false, message: "Choose a CSV file." };
  if (!sources.includes(source)) return { success: false, message: "Choose a supported source." };
  if (file.size > REVIEW_IMPORT_MAX_BYTES) return { success: false, message: "The CSV exceeds the 10 MB limit." };
  const ownedProduct = selectedProductId ? await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SellerProduct" WHERE "id" = ${selectedProductId} AND "sellerId" = ${seller.id} AND "status" = 'ACTIVE'` : [];
  if (selectedProductId && !ownedProduct.length) return { success: false, message: "That product does not belong to this seller." };
  const csv = await file.text();
  const summary = normalizeReviews(csv, source);
  if (summary.rows.length > REVIEW_IMPORT_MAX_ROWS) return { success: false, message: `The CSV may contain at most ${REVIEW_IMPORT_MAX_ROWS.toLocaleString()} rows.` };
  const stored = await storeReviewImportFile(seller.id, file, csv);
  const existingImport = await db.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status" FROM "ReviewImport" WHERE "sellerId"=${seller.id} AND "fileSha256"=${stored.hash} LIMIT 1
  `;
  if (existingImport.length) return { success: true, importId: existingImport[0].id, message: `This file was already submitted (${existingImport[0].status}). Use the existing import instead of uploading it again.` };
  const importId = crypto.randomUUID();
  const status = summary.unsupported ? "NEEDS_MAPPING" : summary.rows.some(row => row.validationStatus === "UNMATCHED") && !selectedProductId ? "NEEDS_MAPPING" : "READY_FOR_SUBMISSION";
  const effectiveValidCount = selectedProductId ? summary.rows.filter(row => row.validationStatus === "UNMATCHED").length + summary.validCount : summary.validCount;
  const effectiveUnmatchedCount = selectedProductId ? 0 : summary.unmatchedCount;
  const previousFingerprints = new Set((await db.$queryRaw<Array<{ dedupeFingerprint: string }>>`
    SELECT rr."dedupeFingerprint" FROM "ReviewImportRow" rr JOIN "ReviewImport" ri ON ri."id" = rr."importId"
    WHERE ri."sellerId" = ${seller.id} AND rr."validationStatus" IN ('APPROVED','VALID','WARNING')
  `).map(row => row.dedupeFingerprint));
  await db.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "ReviewImport" ("id","sellerId","sourcePlatform","originalFileName","storageKey","fileSha256","fileSizeBytes","rowCount","status","validCount","warningCount","rejectedCount","duplicateCount","unmatchedCount","createdAt","updatedAt") VALUES (${importId},${seller.id},${source},${file.name},${stored.key},${stored.hash},${file.size},${summary.rows.length},${status},${effectiveValidCount},${summary.warningCount},${summary.rejectedCount},${summary.duplicateCount},${effectiveUnmatchedCount},NOW(),NOW())`;
    for (const row of summary.rows) {
      const crossImportDuplicate = previousFingerprints.has(row.dedupeFingerprint);
      const rowStatus = crossImportDuplicate ? "DUPLICATE" : selectedProductId && row.validationStatus === "UNMATCHED" ? "VALID" : row.validationStatus;
      await tx.$executeRaw`INSERT INTO "ReviewImportRow" ("id","importId","rowNumber","sourceReviewId","sourceProductIdentifier","sourceProductTitle","sellerProductId","rating","reviewTitle","reviewBody","reviewerDisplayName","reviewerEmail","reviewDate","mediaUrls","sourceVerified","validationStatus","rejectionReason","warningReason","dedupeFingerprint","createdAt","updatedAt") VALUES (${crypto.randomUUID()},${importId},${row.rowNumber},${row.sourceReviewId},${row.sourceProductIdentifier},${row.sourceProductTitle},${selectedProductId || null},${row.rating},${row.reviewTitle},${row.reviewBody},${row.reviewerDisplayName},${row.reviewerEmail},${row.reviewDate},${JSON.stringify(row.mediaUrls)}::jsonb,${row.sourceVerified},${rowStatus},${row.rejectionReason},${row.warningReason},${row.dedupeFingerprint},NOW(),NOW())`;
    }
    await tx.$executeRaw`INSERT INTO "ReviewImportEvent" ("id","importId","toStatus","actorType","actorId","metadata","createdAt") VALUES (${crypto.randomUUID()},${importId},${status},'SELLER',${seller.id},${JSON.stringify({ rows: summary.rows.length })}::jsonb,NOW())`;
  });
  return { success: true, importId, message: `CSV validated: ${summary.rows.length} rows, ${summary.rejectedCount} rejected, ${summary.duplicateCount} duplicates.` };
}

export default function SellerReviewImportPage() {
  const { products, imports, rows, selectedId, sources: sourceOptions, maxBytes, maxRows } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  return <main style={{ maxWidth: 1050, margin: "0 auto", padding: "28px 20px 70px", fontFamily: "Arial", color: "#24162b" }}>
    <Link to="/seller" style={{ color: "#4B1678", fontWeight: 700 }}>← Seller dashboard</Link>
    <h1 style={{ color: "#4B1678" }}>Review Migration</h1>
    <p>Bring your existing product reviews to HairGrab. Reviews must be authentic, relate to the same product, and belong to your business.</p>
    <p style={{ fontSize: 13, color: "#675b6d" }}>CSV only · up to {Math.round(maxBytes / 1024 / 1024)} MB · up to {maxRows.toLocaleString()} rows. Imported reviews are never treated as HairGrab verified purchases.</p>
    {result?.message ? <div style={{ padding: 12, margin: "14px 0", borderRadius: 8, background: result.success ? "#eef8f0" : "#fff0f0" }}>{result.message}</div> : null}
    <Form method="post" encType="multipart/form-data" style={{ display: "grid", gap: 12, padding: 18, border: "1px solid #e3d7e8", borderRadius: 12 }}>
      <label>Source platform<select name="sourcePlatform" defaultValue="JUDGEME" style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }}>{sourceOptions.map(source => <option key={source} value={source}>{source.replaceAll("_", " ")}</option>)}</select></label>
      <label>HairGrab product (choose one when the file contains one product)<select name="sellerProductId" defaultValue="" style={{ display: "block", width: "100%", padding: 10, marginTop: 5 }}><option value="">I will map products after validation</option>{products.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label>
      <label>Original CSV<input name="file" type="file" accept=".csv,text/csv" required style={{ display: "block", marginTop: 7 }} /></label>
      <button type="submit" disabled={navigation.state === "submitting"} style={{ width: "fit-content", background: "#4B1678", color: "white", border: 0, borderRadius: 8, padding: "11px 16px", fontWeight: 800 }}>{navigation.state === "submitting" ? "Validating…" : "Validate CSV"}</button>
    </Form>
    <h2>Authenticity and policy</h2>
    <ul><li>Do not manufacture, rewrite, purchase, or selectively remove unfavorable reviews.</li><li>HairGrab may reject or remove imported reviews. False submissions may result in suspension.</li><li>Original-platform verification remains provenance only; it is not a HairGrab verified purchase.</li></ul>
    <h2>Previous imports</h2>
    {imports.map(item => <div key={item.id} style={{ padding: 12, borderBottom: "1px solid #eee" }}><a href={`/seller/reviews/import?id=${item.id}`}><strong>{item.originalFileName}</strong></a> · {item.sourcePlatform} · {item.status}<div style={{ fontSize: 12, color: "#6d6274" }}>{item.validCount} valid · {item.rejectedCount} rejected · {item.unmatchedCount} unmatched</div></div>)}
    {selectedId && rows.length ? <section><h2>Product mapping and validation</h2>{rows.map(row => <div key={row.id} style={{ padding: 10, borderBottom: "1px solid #eee" }}><strong>{row.rating ?? "?"}/5</strong> · {row.sourceProductTitle || row.sourceProductIdentifier || "Unknown product"} · {row.validationStatus}{row.rejectionReason ? <div>{row.rejectionReason}</div> : null}{!row.sellerProductId ? <Form method="post" style={{ marginTop: 6 }}><input type="hidden" name="intent" value="map" /><input type="hidden" name="importId" value={selectedId} /><input type="hidden" name="sourceProductIdentifier" value={row.sourceProductIdentifier || row.sourceProductTitle || ""} /><select name="sellerProductId" defaultValue=""><option value="">Map to your HairGrab product…</option>{products.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}</select><button type="submit">Save mapping</button></Form> : null}</div>)}</section> : null}
  </main>;
}
