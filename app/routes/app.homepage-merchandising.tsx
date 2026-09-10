import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";

type PickRow = {
  id: string;
  sellerId: string;
  sellerCode: string;
  businessName: string;
  sellerProductId: string;
  title: string;
  shopifyHandle: string | null;
  rank: number;
};

type FeaturedRow = {
  id: string;
  sellerProductId: string;
  title: string;
  shopifyHandle: string | null;
  sellerCode: string;
  businessName: string;
  rank: number;
};

async function getFeaturedRows() {
  return db.$queryRaw<FeaturedRow[]>`
    SELECT
      h."id",
      h."sellerProductId",
      p."title",
      p."shopifyHandle",
      s."sellerCode",
      s."businessName",
      h."rank"
    FROM "HomepageFeaturedProduct" h
    JOIN "SellerProduct" p ON p."id" = h."sellerProductId"
    JOIN "Seller" s ON s."id" = p."sellerId"
    WHERE p."status" = 'ACTIVE' AND s."status" = 'ACTIVE'
    ORDER BY h."rank" ASC, h."createdAt" ASC
  `;
}

async function resequenceFeatured() {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT h."id"
    FROM "HomepageFeaturedProduct" h
    JOIN "SellerProduct" p ON p."id" = h."sellerProductId"
    WHERE p."status" = 'ACTIVE'
    ORDER BY h."rank" ASC, h."createdAt" ASC
  `;

  for (let i = 0; i < rows.length; i += 1) {
    await db.$executeRaw`
      UPDATE "HomepageFeaturedProduct"
      SET "rank" = ${i + 1}, "updatedAt" = NOW()
      WHERE "id" = ${rows[i].id}
    `;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const sellerPicks = await db.$queryRaw<PickRow[]>`
    SELECT
      shp."id",
      shp."sellerId",
      s."sellerCode",
      s."businessName",
      shp."sellerProductId",
      p."title",
      p."shopifyHandle",
      shp."rank"
    FROM "SellerHomepagePick" shp
    JOIN "Seller" s ON s."id" = shp."sellerId"
    JOIN "SellerProduct" p ON p."id" = shp."sellerProductId"
    WHERE s."status" = 'ACTIVE' AND p."status" = 'ACTIVE'
    ORDER BY s."businessName" ASC, shp."rank" ASC
  `;

  const featured = await getFeaturedRows();

  const newArrivals = await db.sellerProduct.findMany({
    where: { status: "ACTIVE", seller: { status: "ACTIVE" } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: {
      id: true,
      title: true,
      shopifyHandle: true,
      publishedAt: true,
      createdAt: true,
      seller: { select: { sellerCode: true, businessName: true } },
    },
  });

  const activeProducts = await db.sellerProduct.findMany({
    where: { status: "ACTIVE", seller: { status: "ACTIVE" } },
    orderBy: [{ seller: { businessName: "asc" } }, { title: "asc" }],
    take: 500,
    select: {
      id: true,
      title: true,
      seller: { select: { sellerCode: true, businessName: true } },
    },
  });

  return { sellerPicks, featured, newArrivals, activeProducts };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const sellerProductId = String(formData.get("sellerProductId") || "");

  if (!sellerProductId) return { success: false, message: "Choose a product first." };

  const product = await db.sellerProduct.findFirst({
    where: { id: sellerProductId, status: "ACTIVE", seller: { status: "ACTIVE" } },
    select: { id: true, title: true },
  });
  if (!product) return { success: false, message: "That product is not currently active." };

  if (intent === "addFeatured") {
    const existing = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "HomepageFeaturedProduct" WHERE "sellerProductId" = ${sellerProductId} LIMIT 1
    `;
    if (existing.length) return { success: true, message: `${product.title} is already Featured.` };

    const countRows = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count" FROM "HomepageFeaturedProduct"
    `;
    const count = Number(countRows[0]?.count || 0);
    if (count >= 12) return { success: false, message: "Featured Products is capped at 12. Remove one before adding another." };

    await db.$executeRaw`
      INSERT INTO "HomepageFeaturedProduct" ("id", "sellerProductId", "rank", "createdAt", "updatedAt")
      VALUES (${`featured:${sellerProductId}`}, ${sellerProductId}, ${count + 1}, NOW(), NOW())
    `;
    return { success: true, message: `${product.title} added to Featured Products.` };
  }

  if (intent === "removeFeatured") {
    await db.$executeRaw`DELETE FROM "HomepageFeaturedProduct" WHERE "sellerProductId" = ${sellerProductId}`;
    await resequenceFeatured();
    return { success: true, message: `${product.title} removed from Featured Products.` };
  }

  return { success: false, message: "Unknown merchandising action." };
};

const panel = { background: "white", border: "1px solid #e5d8ef", borderRadius: "14px", padding: "20px" };

export default function HomepageMerchandisingPage() {
  const { sellerPicks, featured, newArrivals, activeProducts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const working = navigation.state === "submitting";

  const groupedPicks = sellerPicks.reduce<Record<string, { sellerCode: string; businessName: string; products: PickRow[] }>>((groups, row) => {
    if (!groups[row.sellerId]) groups[row.sellerId] = { sellerCode: row.sellerCode, businessName: row.businessName, products: [] };
    groups[row.sellerId].products.push(row);
    return groups;
  }, {});

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "28px", fontFamily: "Arial, sans-serif", color: "#21152a" }}>
      <Link to="/app" style={{ color: "#4B1678", fontWeight: 800, textDecoration: "none", fontSize: "12px" }}>← Back to HairGrab Core</Link>
      <div style={{ margin: "10px 0 24px" }}>
        <div style={{ color: "#7b3fa0", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1.4px" }}>HairGrab Homepage</div>
        <h1 style={{ margin: "5px 0", color: "#4B1678", fontSize: "31px" }}>Homepage Merchandising</h1>
        <p style={{ margin: 0, color: "#6f6675", maxWidth: "850px", lineHeight: 1.5 }}>
          Sellers choose their own Seller Picks. HairGrab controls Featured Products. New Arrivals are automatic from the newest active products.
        </p>
      </div>

      {actionData?.message ? <div style={{ marginBottom: "18px", padding: "12px 14px", borderRadius: "10px", background: actionData.success ? "#eef8f0" : "#fff1f1", border: `1px solid ${actionData.success ? "#cde8d2" : "#efcaca"}`, fontWeight: 700, fontSize: "13px" }}>{actionData.message}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px", alignItems: "start" }}>
        <section style={panel}>
          <h2 style={{ margin: "0 0 5px", color: "#4B1678" }}>Featured Products</h2>
          <p style={{ margin: "0 0 16px", color: "#756b79", fontSize: "12px", lineHeight: 1.45 }}>HairGrab-controlled. Up to 12 products can be featured at one time.</p>

          <Form method="post" style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <input type="hidden" name="intent" value="addFeatured" />
            <select name="sellerProductId" defaultValue="" style={{ flex: "1 1 240px", padding: "10px", border: "1px solid #d8c3e7", borderRadius: "8px" }}>
              <option value="" disabled>Select any active product</option>
              {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.seller.businessName} — {product.title}</option>)}
            </select>
            <button disabled={working} type="submit" style={{ background: "#4B1678", color: "white", border: 0, borderRadius: "8px", padding: "10px 14px", fontWeight: 800 }}>Add Featured</button>
          </Form>

          {featured.length ? featured.map((product) => (
            <div key={product.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderTop: "1px solid #eee6f2", padding: "11px 0", alignItems: "center" }}>
              <div><div style={{ fontWeight: 800 }}>{product.rank}. {product.title}</div><div style={{ color: "#817587", fontSize: "11px" }}>{product.businessName} · {product.sellerCode}</div></div>
              <Form method="post"><input type="hidden" name="intent" value="removeFeatured" /><input type="hidden" name="sellerProductId" value={product.sellerProductId} /><button disabled={working} style={{ border: "1px solid #dbcce4", background: "white", color: "#4B1678", borderRadius: "7px", padding: "7px 10px", fontWeight: 700 }}>Remove</button></Form>
            </div>
          )) : <div style={{ color: "#817587", fontSize: "13px" }}>No products have been marked Featured yet.</div>}
        </section>

        <section style={panel}>
          <h2 style={{ margin: "0 0 5px", color: "#4B1678" }}>New Arrivals</h2>
          <p style={{ margin: "0 0 16px", color: "#756b79", fontSize: "12px", lineHeight: 1.45 }}>Automatic. No seller or admin action is required. These are the newest active HairGrab products.</p>
          {newArrivals.slice(0, 12).map((product, index) => (
            <div key={product.id} style={{ borderTop: index ? "1px solid #eee6f2" : undefined, padding: "10px 0" }}>
              <div style={{ fontWeight: 800 }}>{product.title}</div>
              <div style={{ color: "#817587", fontSize: "11px" }}>{product.seller.businessName} · {product.seller.sellerCode}</div>
            </div>
          ))}
        </section>
      </div>

      <section style={{ ...panel, marginTop: "18px" }}>
        <h2 style={{ margin: "0 0 5px", color: "#4B1678" }}>Seller Picks</h2>
        <p style={{ margin: "0 0 16px", color: "#756b79", fontSize: "12px", lineHeight: 1.45 }}>Seller-controlled. This is where you can see exactly what each seller selected. Seller Picks can rotate fairly on the homepage and also give you a curated pool to consider for Featured Products.</p>

        {Object.values(groupedPicks).length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
            {Object.values(groupedPicks).map((group) => (
              <div key={group.sellerCode} style={{ border: "1px solid #eadff0", borderRadius: "11px", padding: "14px" }}>
                <div style={{ color: "#4B1678", fontWeight: 800 }}>{group.businessName}</div>
                <div style={{ color: "#817587", fontSize: "11px", marginBottom: "9px" }}>{group.sellerCode} · {group.products.length} selected</div>
                {group.products.map((product) => (
                  <div key={product.id} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "7px 0", borderTop: "1px solid #f1ebf4" }}>
                    <span style={{ fontSize: "12px" }}>{product.rank}. {product.title}</span>
                    <Form method="post"><input type="hidden" name="intent" value="addFeatured" /><input type="hidden" name="sellerProductId" value={product.sellerProductId} /><button disabled={working} style={{ border: 0, background: "transparent", color: "#4B1678", fontWeight: 800, cursor: "pointer", fontSize: "11px" }}>+ Feature</button></Form>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : <div style={{ color: "#817587", fontSize: "13px" }}>No sellers have chosen Seller Picks yet.</div>}
      </section>
    </div>
  );
}
