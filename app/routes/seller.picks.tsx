import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import db from "../db.server";
import { requireSellerSession } from "../seller-session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { seller } = await requireSellerSession(request);

  const products = await db.sellerProduct.findMany({
    where: { sellerId: seller.id, status: "ACTIVE" },
    orderBy: { title: "asc" },
    select: { id: true, title: true, sellerSku: true, shopifyHandle: true },
  });

  const selected = await db.$queryRaw<Array<{ sellerProductId: string; rank: number }>>`
    SELECT "sellerProductId", "rank"
    FROM "SellerHomepagePick"
    WHERE "sellerId" = ${seller.id}
    ORDER BY "rank" ASC
  `;

  return {
    seller: { businessName: seller.businessName, sellerCode: seller.sellerCode },
    products,
    selectedIds: selected.map((row) => row.sellerProductId),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { seller } = await requireSellerSession(request);
  const formData = await request.formData();
  const requestedIds = formData.getAll("productId").map(String);
  const uniqueIds = Array.from(new Set(requestedIds));

  if (uniqueIds.length > 5) {
    return { success: false, message: "Choose no more than 5 Seller Picks." };
  }

  const validProducts = uniqueIds.length
    ? await db.sellerProduct.findMany({
        where: { sellerId: seller.id, status: "ACTIVE", id: { in: uniqueIds } },
        select: { id: true },
      })
    : [];

  const validIds = new Set(validProducts.map((product) => product.id));
  if (validIds.size !== uniqueIds.length) {
    return { success: false, message: "One or more selected products are not active HairGrab products." };
  }

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "SellerHomepagePick" WHERE "sellerId" = ${seller.id}`;

    for (let index = 0; index < uniqueIds.length; index += 1) {
      const productId = uniqueIds[index];
      await tx.$executeRaw`
        INSERT INTO "SellerHomepagePick" ("id", "sellerId", "sellerProductId", "rank", "createdAt", "updatedAt")
        VALUES (${`${seller.id}:${productId}`}, ${seller.id}, ${productId}, ${index + 1}, NOW(), NOW())
      `;
    }
  });

  return {
    success: true,
    message: uniqueIds.length
      ? `${uniqueIds.length} Seller Pick${uniqueIds.length === 1 ? "" : "s"} saved.`
      : "Seller Picks cleared.",
  };
};

export default function SellerPicksPage() {
  const { seller, products, selectedIds } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  return (
    <div style={{ minHeight: "100vh", background: "#faf8fc", fontFamily: "Arial, sans-serif", color: "#21152a" }}>
      <header style={{ background: "#4B1678", color: "white", padding: "18px 22px" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "1px", opacity: 0.82 }}>HAIRGRAB SELLER</div>
          <div style={{ fontSize: "24px", fontWeight: 800 }}>Seller Picks</div>
        </div>
      </header>

      <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "26px 20px 60px" }}>
        <Link to="/seller" style={{ color: "#4B1678", fontWeight: 800, textDecoration: "none", fontSize: "12px" }}>← Back to Dashboard</Link>
        <h1 style={{ color: "#4B1678", margin: "12px 0 5px" }}>Choose up to 5 Seller Picks</h1>
        <div style={{ color: "#756b79", fontSize: "13px" }}>{seller.businessName} · {seller.sellerCode}</div>
        <p style={{ color: "#5f5664", lineHeight: 1.55, maxWidth: "760px" }}>
          Choose the products you most want shoppers to discover. Your Seller Picks can appear in HairGrab's rotating Seller Picks section and may also be considered by HairGrab for Featured Products. You can change your picks at any time.
        </p>
        <div style={{ background: "#f7f2fa", border: "1px solid #eadff0", borderRadius: "10px", padding: "12px 14px", color: "#66586f", fontSize: "12px", lineHeight: 1.5 }}>
          Seller Picks do not guarantee placement in HairGrab's Featured Products section. HairGrab controls Featured Products so the homepage stays curated, fair and varied.
        </div>

        {actionData?.message ? <div style={{ background: actionData.success ? "#eef8f0" : "#fff1f1", border: `1px solid ${actionData.success ? "#cde8d2" : "#efcaca"}`, borderRadius: "9px", padding: "11px 13px", margin: "14px 0", fontSize: "13px", fontWeight: 700 }}>{actionData.message}</div> : null}

        <Form method="post">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", marginTop: "18px" }}>
            {products.map((product) => (
              <label key={product.id} style={{ background: "white", border: "1px solid #e5dce9", borderRadius: "12px", padding: "14px", display: "flex", gap: "11px", alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" name="productId" value={product.id} defaultChecked={selectedIds.includes(product.id)} style={{ marginTop: "3px", width: "18px", height: "18px", accentColor: "#4B1678" }} />
                <span>
                  <span style={{ display: "block", color: "#4B1678", fontWeight: 800 }}>{product.title}</span>
                  {product.sellerSku ? <span style={{ display: "block", color: "#807584", fontSize: "11px", marginTop: "4px" }}>SKU: {product.sellerSku}</span> : null}
                </span>
              </label>
            ))}
          </div>

          {products.length === 0 ? <div style={{ background: "white", border: "1px solid #e5dce9", borderRadius: "12px", padding: "22px", marginTop: "18px", color: "#756b79" }}>You do not have active products available for Seller Picks yet.</div> : null}

          <button type="submit" disabled={saving} style={{ marginTop: "18px", background: "#4B1678", color: "white", border: 0, borderRadius: "8px", padding: "11px 17px", fontWeight: 800, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save Seller Picks"}</button>
        </Form>
      </main>
    </div>
  );
}
