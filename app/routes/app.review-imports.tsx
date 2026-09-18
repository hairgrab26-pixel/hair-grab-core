import crypto from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { judgeMeCsv } from "../review-import.server";
import { Prisma } from "@prisma/client";

type ImportRow = { id: string; importId: string; rowNumber: number; sourceReviewId: string | null; sourceProductIdentifier: string | null; sourceProductTitle: string | null; sellerProductId: string | null; sellerProductTitle: string | null; rating: number | null; reviewTitle: string | null; reviewBody: string | null; reviewerDisplayName: string | null; reviewDate: Date | null; validationStatus: string; rejectionReason: string | null; mediaUrls: unknown };

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const sellerFilter = url.searchParams.get("seller")?.toLowerCase();
  const sourceFilter = url.searchParams.get("source")?.toLowerCase();
  const fromFilter = url.searchParams.get("from");
  const toFilter = url.searchParams.get("to");
  const imports = await db.$queryRaw<Array<{ id: string; sellerCode: string; businessName: string; sourcePlatform: string; originalFileName: string; status: string; validCount: number; rejectedCount: number; duplicateCount: number; unmatchedCount: number; certificationAccepted: boolean; createdAt: Date }>>`
    SELECT r."id", s."sellerCode", s."businessName", r."sourcePlatform", r."originalFileName", r."status", r."validCount", r."rejectedCount", r."duplicateCount", r."unmatchedCount", r."certificationAccepted", r."createdAt"
    FROM "ReviewImport" r JOIN "Seller" s ON s."id" = r."sellerId"
    ORDER BY r."createdAt" DESC LIMIT 100
  `;
  // Status filtering is applied in memory to avoid interpolating identifiers into SQL.
  const filtered = imports.filter(item => (!status || item.status === status) && (!sellerFilter || `${item.sellerCode} ${item.businessName}`.toLowerCase().includes(sellerFilter)) && (!sourceFilter || item.sourcePlatform.toLowerCase() === sourceFilter) && (!fromFilter || item.createdAt >= new Date(fromFilter)) && (!toFilter || item.createdAt < new Date(`${toFilter}T23:59:59.999Z`)));
  const selectedId = url.searchParams.get("id");
  const rows = selectedId ? await db.$queryRaw<ImportRow[]>`
    SELECT r."id", r."importId", r."rowNumber", r."sourceReviewId", r."sourceProductIdentifier", r."sourceProductTitle", r."sellerProductId", p."title" AS "sellerProductTitle", r."rating", r."reviewTitle", r."reviewBody", r."reviewerDisplayName", r."reviewDate", r."validationStatus", r."rejectionReason", r."mediaUrls"
    FROM "ReviewImportRow" r LEFT JOIN "SellerProduct" p ON p."id" = r."sellerProductId" WHERE r."importId" = ${selectedId} ORDER BY r."rowNumber" ASC
  ` : [];
  const products = selectedId ? await db.$queryRaw<Array<{ id: string; title: string }>>`SELECT p."id", p."title" FROM "SellerProduct" p JOIN "ReviewImport" i ON i."sellerId"=p."sellerId" WHERE i."id"=${selectedId} AND p."status"='ACTIVE' ORDER BY p."title" ASC` : [];
  return { imports: filtered, rows, products, selectedId };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const importId = String(form.get("importId") || "");
  if (!importId) return { success: false, message: "Choose an import." };
  if (intent === "map") {
    const sourceIdentifier = String(form.get("sourceProductIdentifier") || "").trim();
    const sellerProductId = String(form.get("sellerProductId") || "").trim();
    if (!sourceIdentifier || !sellerProductId) return { success: false, message: "A source identifier and HairGrab product are required." };
    const owned = await db.$queryRaw<Array<{ id: string }>>`
      SELECT p."id" FROM "SellerProduct" p
      JOIN "ReviewImport" i ON i."sellerId" = p."sellerId"
      WHERE p."id"=${sellerProductId} AND i."id"=${importId}
    `;
    if (!owned.length) return { success: false, message: "The selected HairGrab product does not exist." };
    await db.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "ReviewImportProductMapping" ("id","importId","sourceProductIdentifier","sellerProductId","matchMethod","confirmedBy","confirmedAt","createdAt","updatedAt") VALUES (${crypto.randomUUID()},${importId},${sourceIdentifier},${sellerProductId},'MANUAL',${session?.shop || "admin"},NOW(),NOW(),NOW()) ON CONFLICT ("importId","sourceProductIdentifier") DO UPDATE SET "sellerProductId"=EXCLUDED."sellerProductId", "confirmedBy"=EXCLUDED."confirmedBy", "confirmedAt"=NOW(), "updatedAt"=NOW()`;
      await tx.$executeRaw`UPDATE "ReviewImportRow" SET "sellerProductId"=${sellerProductId}, "validationStatus"=CASE WHEN "validationStatus" IN ('UNMATCHED','WARNING') THEN 'VALID' ELSE "validationStatus" END, "updatedAt"=NOW() WHERE "importId"=${importId} AND COALESCE("sourceProductIdentifier","sourceProductTitle")=${sourceIdentifier}`;
      await tx.$executeRaw`UPDATE "ReviewImport" SET "status"='READY_FOR_SUBMISSION', "updatedAt"=NOW() WHERE "id"=${importId} AND "status"='NEEDS_MAPPING'`;
    });
    return { success: true, message: "Product mapping saved." };
  }
  if (intent === "reject") {
    const reason = String(form.get("reason") || "").trim();
    if (!reason) return { success: false, message: "A rejection reason is required." };
    await db.$executeRaw`UPDATE "ReviewImport" SET "status"='REJECTED', "reviewedAt"=NOW(), "reviewedBy"=${session?.shop || "admin"}, "reviewDecisionReason"=${reason}, "updatedAt"=NOW() WHERE "id"=${importId}`;
    await db.$executeRaw`INSERT INTO "ReviewImportEvent" ("id","importId","toStatus","actorType","actorId","reason","createdAt") VALUES (${crypto.randomUUID()},${importId},'REJECTED','ADMIN',${session?.shop || null},${reason},NOW())`;
    return { success: true, message: "Import rejected." };
  }
  if (intent === "request_corrections") {
    const reason = String(form.get("reason") || "").trim();
    if (!reason) return { success: false, message: "Explain what the seller must correct." };
    await db.$executeRaw`UPDATE "ReviewImport" SET "status"='NEEDS_MAPPING', "reviewedAt"=NOW(), "reviewedBy"=${session?.shop || "admin"}, "reviewDecisionReason"=${reason}, "updatedAt"=NOW() WHERE "id"=${importId}`;
    await db.$executeRaw`INSERT INTO "ReviewImportEvent" ("id","importId","toStatus","actorType","actorId","reason","createdAt") VALUES (${crypto.randomUUID()},${importId},'NEEDS_MAPPING','ADMIN',${session?.shop || null},${reason},NOW())`;
    return { success: true, message: "Correction request sent to the seller." };
  }
  if (intent === "approve" || intent === "partial") {
    const rowIds = form.getAll("rowId").map(String);
    if (!rowIds.length) return { success: false, message: "Select at least one mapped valid row." };
    const rows = await db.$queryRaw<Array<{ id: string; sellerProductId: string | null; validationStatus: string }>>`SELECT "id","sellerProductId","validationStatus" FROM "ReviewImportRow" WHERE "importId"=${importId} AND "id" IN (${Prisma.join(rowIds)})`;
    if (rows.some(row => !row.sellerProductId || !["VALID", "WARNING"].includes(row.validationStatus))) return { success: false, message: "Only mapped valid rows can be approved." };
    await db.$executeRaw`UPDATE "ReviewImportRow" SET "validationStatus"='APPROVED', "approvedAt"=NOW(), "updatedAt"=NOW() WHERE "importId"=${importId} AND "id" IN (${Prisma.join(rowIds)})`;
    const next = intent === "partial" ? "PARTIALLY_APPROVED" : "APPROVED";
    await db.$executeRaw`UPDATE "ReviewImport" SET "status"=${next}, "reviewedAt"=NOW(), "reviewedBy"=${session?.shop || "admin"}, "updatedAt"=NOW() WHERE "id"=${importId}`;
    await db.$executeRaw`INSERT INTO "ReviewImportEvent" ("id","importId","toStatus","actorType","actorId","metadata","createdAt") VALUES (${crypto.randomUUID()},${importId},${next},'ADMIN',${session?.shop || null},${JSON.stringify({ approvedRows: rowIds.length })}::jsonb,NOW())`;
    return { success: true, message: `${rowIds.length} review${rowIds.length === 1 ? "" : "s"} approved.` };
  }
  if (intent === "export") {
    const retry = form.get("retryExport") === "on";
    const rows = await db.$queryRaw<Array<ImportRow & { reviewerEmail: string | null }>>`SELECT r.*, p."shopifyHandle", r."reviewerEmail" FROM "ReviewImportRow" r LEFT JOIN "SellerProduct" p ON p."id"=r."sellerProductId" WHERE r."importId"=${importId} AND r."validationStatus"='APPROVED' AND (${retry} OR r."exportedAt" IS NULL)`;
    if (!rows.length) return { success: false, message: "No new approved rows remain. Check retry export only when an administrator intentionally needs the same rows again." };
    const csv = judgeMeCsv(rows.map(row => ({ ...row, sellerProduct: { shopifyHandle: (row as ImportRow & { shopifyHandle?: string | null }).shopifyHandle || null } })));
    await db.$executeRaw`UPDATE "ReviewImportRow" SET "exportedAt"=NOW(), "updatedAt"=NOW() WHERE "importId"=${importId} AND "validationStatus"='APPROVED'`;
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hairgrab-judgeme-${importId}.csv"` } });
  }
  return { success: false, message: "Unknown review-import action." };
}

export default function ReviewImportsAdminPage() {
  const { imports, rows, products, selectedId } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  return <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "Arial", color: "#24162b" }}>
    <h1 style={{ color: "#4B1678" }}>Review Imports</h1>
    {result?.message ? <p style={{ padding: 10, background: result.success ? "#eef8f0" : "#fff0f0" }}>{result.message}</p> : null}
    <Form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}><input name="seller" placeholder="Seller" /><select name="status" defaultValue=""><option value="">All statuses</option><option value="SUBMITTED">Submitted</option><option value="UNDER_REVIEW">Under review</option><option value="NEEDS_MAPPING">Needs mapping</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><select name="source" defaultValue=""><option value="">All sources</option><option value="JUDGEME">Judge.me</option><option value="SHOPIFY_PRODUCT_REVIEWS">Shopify Product Reviews</option><option value="LOOX">Loox</option><option value="YOTPO">Yotpo</option><option value="ETSY">Etsy</option><option value="AMAZON">Amazon</option><option value="OTHER_CSV">Other CSV</option></select><button type="submit">Filter</button></Form>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(420px, 2fr)", gap: 20 }}>
      <section>{imports.map(item => <a key={item.id} href={`/app/review-imports?id=${item.id}`} style={{ display: "block", padding: 12, borderBottom: "1px solid #eee", textDecoration: "none", color: "inherit", background: selectedId === item.id ? "#f4edf7" : "white" }}><strong>{item.businessName}</strong> · {item.sourcePlatform}<div style={{ fontSize: 12 }}>{item.status} · {item.validCount} valid · {item.rejectedCount} rejected</div></a>)}</section>
      <section>{selectedId ? <>
        <h2>Review rows</h2>
        <div style={{ maxHeight: 520, overflow: "auto" }}>{rows.map(row => <div key={row.id} style={{ padding: 10, borderBottom: "1px solid #eee" }}><label><input type="checkbox" form="approval-form" name="rowId" value={row.id} defaultChecked={row.validationStatus === "VALID" || row.validationStatus === "WARNING"} /> <strong>{row.rating ?? "?"}/5</strong> · {row.sourceProductTitle || "Unmapped product"} · {row.validationStatus}</label><div>{row.reviewBody}</div>{row.sellerProductId ? <div style={{ fontSize: 12 }}>Mapped to {row.sellerProductTitle}</div> : <Form method="post" style={{ marginTop: 6 }}><input type="hidden" name="intent" value="map" /><input type="hidden" name="importId" value={selectedId} /><input type="hidden" name="sourceProductIdentifier" value={row.sourceProductIdentifier || row.sourceProductTitle || ""} /><select name="sellerProductId" defaultValue=""><option value="">Map to HairGrab product…</option>{products.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}</select><button type="submit">Save mapping</button></Form>}{row.rejectionReason ? <small>{row.rejectionReason}</small> : null}</div>)}</div>
        <Form id="approval-form" method="post"><input type="hidden" name="importId" value={selectedId} /><button name="intent" value="partial" disabled={navigation.state === "submitting"}>Approve selected valid rows</button> <button name="intent" value="approve" disabled={navigation.state === "submitting"}>Approve batch</button><label><input type="checkbox" name="retryExport" /> intentional retry</label> <button name="intent" value="export" disabled={navigation.state === "submitting"}>Export Judge.me CSV</button><input name="reason" placeholder="Rejection/correction reason" /><button name="intent" value="request_corrections">Request corrections</button><button name="intent" value="reject">Reject import</button></Form>
      </> : <p>Select an import to inspect all rows, including low-star reviews.</p>}</section>
    </div>
  </main>;
}