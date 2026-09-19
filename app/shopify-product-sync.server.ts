import db from "./db.server";
import { unauthenticated } from "./shopify.server";
export {
  customSearchDiscoveryMetafields,
  serializeCustomListMetafieldValue,
  upsertCustomSearchDiscoveryMetafields,
} from "./custom-product-metafields.ts";

type SellerForProductSync = {
  id: string;
  sellerCode: string;
  businessName: string;
  shopifyVendor: string;
};

type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string;
};

type ShopifyProductsResponse = {
  data?: {
    products?: {
      nodes?: ShopifyProductNode[];
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      };
    };
  };

  errors?: Array<{
    message?: string;
  }>;
};


async function getShopifyAdmin() {
  const offlineSession =
    await db.session.findFirst({
      where: {
        isOnline: false,
      },
    });

  if (!offlineSession) {
    throw new Error(
      "HairGrab could not find the Shopify offline session.",
    );
  }

  return unauthenticated.admin(
    offlineSession.shop,
  );
}


function escapeShopifySearchValue(
  value: string,
) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}


function mapShopifyStatus(
  status: string,
) {
  const normalized =
    String(status || "")
      .trim()
      .toUpperCase();

  if (normalized === "ACTIVE") {
    return "ACTIVE";
  }

  if (normalized === "ARCHIVED") {
    return "ARCHIVED";
  }

  return "DRAFT";
}


export async function syncSellerProductsFromShopify(
  seller: SellerForProductSync,
) {
  const vendor =
    String(
      seller.shopifyVendor || "",
    ).trim();

  if (!vendor) {
    return {
      scanned: 0,
      adopted: 0,
      updated: 0,
      skippedOwnedByAnotherSeller: 0,
    };
  }

  const { admin } =
    await getShopifyAdmin();

  const searchQuery =
    `vendor:"${escapeShopifySearchValue(vendor)}"`;

  let after: string | null = null;
  let hasNextPage = true;

  let scanned = 0;
  let adopted = 0;
  let updated = 0;
  let skippedOwnedByAnotherSeller = 0;


  while (hasNextPage) {
    const response =
      await admin.graphql(
        `#graphql
        query HairGrabSellerProducts(
          $query: String!
          $after: String
        ) {
          products(
            first: 100
            after: $after
            query: $query
          ) {
            nodes {
              id
              title
              handle
              status
              vendor
            }

            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        `,
        {
          variables: {
            query: searchQuery,
            after,
          },
        },
      );

    const json =
      (await response.json()) as ShopifyProductsResponse;

    if (
      json.errors &&
      json.errors.length > 0
    ) {
      throw new Error(
        json.errors
          .map(
            (error) =>
              error.message ||
              "Unknown Shopify error.",
          )
          .join(" | "),
      );
    }

    const products =
      json.data?.products?.nodes || [];

    for (const product of products) {
      scanned += 1;

      // Extra protection: only adopt an exact vendor match.
      if (
        String(product.vendor || "")
          .trim()
          .toLowerCase() !==
        vendor.toLowerCase()
      ) {
        continue;
      }

      const existing =
        await db.sellerProduct.findUnique({
          where: {
            shopifyProductId:
              product.id,
          },

          select: {
            id: true,
            sellerId: true,
          },
        });

      // Never silently move a product from one seller to another.
      if (
        existing &&
        existing.sellerId !==
          seller.id
      ) {
        skippedOwnedByAnotherSeller += 1;
        continue;
      }

      const status =
        mapShopifyStatus(
          product.status,
        );

      if (existing) {
        await db.sellerProduct.update({
          where: {
            id:
              existing.id,
          },

          data: {
            title:
              product.title,

            shopifyHandle:
              product.handle,

            status,

            publishedToShopify:
              status === "ACTIVE",
          },
        });

        updated += 1;
      } else {
        await db.sellerProduct.create({
          data: {
            sellerId:
              seller.id,

            shopifyProductId:
              product.id,

            shopifyHandle:
              product.handle,

            title:
              product.title,

            status,

            publishedToShopify:
              status === "ACTIVE",
          },
        });

        adopted += 1;
      }
    }

    hasNextPage =
      Boolean(
        json.data
          ?.products
          ?.pageInfo
          ?.hasNextPage,
      );

    after =
      json.data
        ?.products
        ?.pageInfo
        ?.endCursor ||
      null;

    if (
      hasNextPage &&
      !after
    ) {
      throw new Error(
        "Shopify product sync pagination stopped because no next cursor was returned.",
      );
    }
  }


  return {
    scanned,
    adopted,
    updated,
    skippedOwnedByAnotherSeller,
  };
}
