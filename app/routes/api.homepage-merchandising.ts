import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";

type MerchRow = {
  sellerProductId: string;
  title: string;
  shopifyProductId: string | null;
  shopifyHandle: string | null;
  sellerCode: string;
  businessName: string;
  rank: number;
};

function fairSellerRotation(rows: MerchRow[], limit = 12) {
  const bySeller = new Map<string, MerchRow[]>();
  for (const row of rows) {
    const list = bySeller.get(row.sellerCode) || [];
    list.push(row);
    bySeller.set(row.sellerCode, list);
  }
  const sellers = Array.from(bySeller.keys());
  const output: MerchRow[] = [];
  let round = 0;
  while (output.length < limit) {
    let added = false;
    for (const seller of sellers) {
      const item = bySeller.get(seller)?.[round];
      if (item) {
        output.push(item);
        added = true;
        if (output.length >= limit) break;
      }
    }
    if (!added) break;
    round += 1;
  }
  return output;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const featured = await db.$queryRaw<MerchRow[]>`
    SELECT p."id" AS "sellerProductId", p."title", p."shopifyProductId", p."shopifyHandle",
           s."sellerCode", s."businessName", h."rank"
    FROM "HomepageFeaturedProduct" h
    JOIN "SellerProduct" p ON p."id" = h."sellerProductId"
    JOIN "Seller" s ON s."id" = p."sellerId"
    WHERE p."status" = 'ACTIVE' AND s."status" = 'ACTIVE'
    ORDER BY h."rank" ASC, h."createdAt" ASC
    LIMIT 12
  `;

  const sellerPickRows = await db.$queryRaw<MerchRow[]>`
    SELECT p."id" AS "sellerProductId", p."title", p."shopifyProductId", p."shopifyHandle",
           s."sellerCode", s."businessName", shp."rank"
    FROM "SellerHomepagePick" shp
    JOIN "SellerProduct" p ON p."id" = shp."sellerProductId"
    JOIN "Seller" s ON s."id" = shp."sellerId"
    WHERE p."status" = 'ACTIVE' AND s."status" = 'ACTIVE'
    ORDER BY shp."rank" ASC, s."sellerCode" ASC
  `;

  const newArrivalRows = await db.sellerProduct.findMany({
    where: { status: "ACTIVE", seller: { status: "ACTIVE" } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 12,
    select: {
      id: true,
      title: true,
      shopifyProductId: true,
      shopifyHandle: true,
      seller: { select: { sellerCode: true, businessName: true } },
    },
  });

  const newArrivals = newArrivalRows.map((p, index) => ({
    sellerProductId: p.id,
    title: p.title,
    shopifyProductId: p.shopifyProductId,
    shopifyHandle: p.shopifyHandle,
    sellerCode: p.seller.sellerCode,
    businessName: p.seller.businessName,
    rank: index + 1,
  }));

  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = origin === "https://hairgrab.com" || origin === "https://www.hairgrab.com" ? origin : "https://hairgrab.com";

  return new Response(JSON.stringify({
    featuredProducts: featured,
    newArrivals,
    sellerPicks: fairSellerRotation(sellerPickRows, 12),
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": allowedOrigin,
      "Vary": "Origin",
    },
  });
};
