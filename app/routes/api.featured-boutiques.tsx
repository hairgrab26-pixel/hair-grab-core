import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Method not allowed.",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://hairgrab.com",
        },
      },
    );
  }

  const sellers = await db.seller.findMany({
    where: {
      status: "ACTIVE",
      homepageFeatured: true,
      storeSlug: {
        not: null,
      },
    },

    select: {
      id: true,
      sellerCode: true,
      businessName: true,
      storeSlug: true,
      storeDescription: true,
      logoUrl: true,
      bannerUrl: true,
      homepageFeaturedRank: true,
    },

    orderBy: [
      {
        homepageFeaturedRank: "asc",
      },
      {
        businessName: "asc",
      },
    ],

    take: 15,
  });

  const boutiques = sellers.map((seller) => ({
    id: seller.id,
    sellerCode: seller.sellerCode,
    businessName: seller.businessName,
    storeDescription:
      seller.storeDescription ||
      "Shop this seller on HairGrab.",
    imageUrl:
      seller.logoUrl ||
      seller.bannerUrl ||
      "",
    storefrontUrl:
      `https://shops.hairgrab.com/seller-store/${seller.storeSlug}`,
    rank:
      seller.homepageFeaturedRank,
  }));

  return new Response(
    JSON.stringify({
      success: true,
      boutiques,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://hairgrab.com",
        "Cache-Control": "public, max-age=60",
      },
    },
  );
};