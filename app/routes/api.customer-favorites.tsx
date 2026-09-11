import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  authenticate,
  unauthenticated,
} from "../shopify.server";

import db from "../db.server";


type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;

  featuredMedia:
    | {
        preview:
          | {
              image:
                | {
                    url: string;
                    altText:
                      | string
                      | null;
                  }
                | null;
            }
          | null;
      }
    | null;

  priceRangeV2: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
};


type ShopifyProductsResponse = {
  nodes: Array<
    ShopifyProductNode |
    null
  >;
};


function json(
  data: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store",
      },
    },
  );
}


function normalizeCustomerId(
  value: unknown,
) {
  const raw =
    String(
      value || "",
    ).trim();

  if (!raw) {
    return "";
  }

  if (
    raw.startsWith(
      "gid://shopify/Customer/",
    )
  ) {
    return raw.replace(
      "gid://shopify/Customer/",
      "",
    );
  }

  return raw;
}


function normalizeShop(
  value: unknown,
) {
  const raw =
    String(
      value || "",
    ).trim();

  if (!raw) {
    return "";
  }

  try {
    if (
      raw.startsWith(
        "http://",
      ) ||
      raw.startsWith(
        "https://",
      )
    ) {
      return new URL(
        raw,
      ).hostname;
    }
  } catch {
    return "";
  }

  return raw;
}


function normalizeProductGid(
  value: unknown,
) {
  const raw =
    String(
      value || "",
    ).trim();

  if (!raw) {
    return "";
  }

  if (
    raw.startsWith(
      "gid://shopify/Product/",
    )
  ) {
    return raw;
  }

  if (
    /^\d+$/.test(raw)
  ) {
    return `gid://shopify/Product/${raw}`;
  }

  return "";
}


// ==========================================================
// LOAD CUSTOMER FAVORITES
// ==========================================================

export const loader =
  async ({
    request,
  }: LoaderFunctionArgs) => {
    const {
      cors,
      sessionToken,
    } =
      await authenticate.public.customerAccount(
        request,
      );


    const customerId =
      normalizeCustomerId(
        sessionToken.sub,
      );


    const shop =
      normalizeShop(
        sessionToken.dest,
      );


    if (
      !customerId ||
      !shop
    ) {
      return cors(
        json(
          {
            authenticated:
              false,

            favoriteProductGids:
              [],

            favorites:
              [],
          },

          401,
        ),
      );
    }


    // ======================================================
    // LOAD HAIRGRAB FAVORITE RECORDS
    // ======================================================

    const favoriteRows =
      await db.customerFavorite.findMany({
        where: {
          shop,

          shopifyCustomerId:
            customerId,

          sellerProduct: {
            is: {
              status:
                "ACTIVE",
            },
          },
        },

        orderBy: {
          createdAt:
            "desc",
        },

        include: {
          sellerProduct: {
            select: {
              shopifyProductId:
                true,

              shopifyHandle:
                true,

              title:
                true,

              seller: {
                select: {
                  businessName:
                    true,
                },
              },
            },
          },
        },
      });


    const productGids =
      favoriteRows
        .map(
          (
            favorite,
          ) =>
            favorite
              .sellerProduct
              .shopifyProductId,
        )
        .filter(
          (
            value,
          ): value is string =>
            Boolean(value),
        );


    // ======================================================
    // LOAD CURRENT SHOPIFY PRODUCT DISPLAY DATA
    //
    // SellerProduct remains HairGrab's ownership authority.
    // Shopify remains the display authority for current
    // product imagery and pricing.
    // ======================================================

    const shopifyProducts =
      new Map<
        string,
        ShopifyProductNode
      >();


    if (
      productGids.length >
      0
    ) {
      try {
        const {
          admin,
        } =
          await unauthenticated.admin(
            shop,
          );


        const response =
          await admin.graphql(
            `#graphql
            query HairGrabFavoriteProducts(
              $ids: [ID!]!
            ) {
              nodes(
                ids: $ids
              ) {
                ... on Product {
                  id
                  title
                  handle

                  featuredMedia {
                    preview {
                      image {
                        url
                        altText
                      }
                    }
                  }

                  priceRangeV2 {
                    minVariantPrice {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
            `,
            {
              variables: {
                ids:
                  productGids,
              },
            },
          );


        const payload =
          await response.json() as {
            data?:
              ShopifyProductsResponse;

            errors?:
              Array<{
                message?:
                  string;
              }>;
          };


        if (
          payload.errors &&
          payload.errors.length >
            0
        ) {
          throw new Error(
            payload.errors
              .map(
                (
                  error,
                ) =>
                  error.message ||
                  "Unknown Shopify error.",
              )
              .join(
                " | ",
              ),
          );
        }


        for (
          const product of
          payload.data?.nodes ||
          []
        ) {
          if (
            product?.id
          ) {
            shopifyProducts.set(
              product.id,
              product,
            );
          }
        }
      } catch (
        error
      ) {
        console.error(
          "[HairGrab Core] Unable to load Shopify display data for customer favorites:",
          error,
        );
      }
    }


    // ======================================================
    // BUILD CUSTOMER FAVORITES RESPONSE
    // ======================================================

    const favorites =
      favoriteRows
        .map(
          (
            favorite,
          ) => {
            const sellerProduct =
              favorite.sellerProduct;


            const productGid =
              sellerProduct
                .shopifyProductId;


            if (
              !productGid
            ) {
              return null;
            }


            const shopifyProduct =
              shopifyProducts.get(
                productGid,
              );


            const handle =
              shopifyProduct
                ?.handle ||
              sellerProduct
                .shopifyHandle ||
              "";


            const image =
              shopifyProduct
                ?.featuredMedia
                ?.preview
                ?.image ||
              null;


            const price =
              shopifyProduct
                ?.priceRangeV2
                ?.minVariantPrice ||
              null;


            return {
              productGid,

              title:
                shopifyProduct
                  ?.title ||
                sellerProduct
                  .title,

              handle,

              sellerName:
                sellerProduct
                  .seller
                  .businessName,

              imageUrl:
                image?.url ||
                null,

              imageAlt:
                image?.altText ||
                shopifyProduct
                  ?.title ||
                sellerProduct
                  .title,

              priceAmount:
                price?.amount ||
                null,

              currencyCode:
                price
                  ?.currencyCode ||
                "USD",

              productUrl:
                handle
                  ? `https://hairgrab.com/products/${encodeURIComponent(
                      handle,
                    )}`
                  : "https://hairgrab.com",
            };
          },
        )
        .filter(
          (
            favorite,
          ): favorite is NonNullable<
            typeof favorite
          > =>
            Boolean(
              favorite,
            ),
        );


    return cors(
      json({
        authenticated:
          true,

        favoriteProductGids:
          productGids,

        favorites,
      }),
    );
  };


// ==========================================================
// REMOVE A FAVORITE FROM CUSTOMER ACCOUNT
// ==========================================================

export const action =
  async ({
    request,
  }: ActionFunctionArgs) => {
    const {
      cors,
      sessionToken,
    } =
      await authenticate.public.customerAccount(
        request,
      );


    const customerId =
      normalizeCustomerId(
        sessionToken.sub,
      );


    const shop =
      normalizeShop(
        sessionToken.dest,
      );


    if (
      !customerId ||
      !shop
    ) {
      return cors(
        json(
          {
            success:
              false,

            authenticated:
              false,

            message:
              "Sign in to manage favorites.",
          },

          401,
        ),
      );
    }


    const body =
      await request
        .json()
        .catch(
          () => ({}),
        ) as {
          intent?:
            string;

          productGid?:
            string;
        };


    const intent =
      String(
        body.intent ||
        "",
      )
        .trim()
        .toLowerCase();


    if (
      intent !==
      "remove"
    ) {
      return cors(
        json(
          {
            success:
              false,

            authenticated:
              true,

            message:
              "Unknown favorites action.",
          },

          400,
        ),
      );
    }


    const productGid =
      normalizeProductGid(
        body.productGid,
      );


    if (
      !productGid
    ) {
      return cors(
        json(
          {
            success:
              false,

            authenticated:
              true,

            message:
              "Product was not provided.",
          },

          400,
        ),
      );
    }


    const sellerProduct =
      await db.sellerProduct.findUnique({
        where: {
          shopifyProductId:
            productGid,
        },

        select: {
          id:
            true,
        },
      });


    if (
      !sellerProduct
    ) {
      return cors(
        json(
          {
            success:
              false,

            authenticated:
              true,

            message:
              "Favorite product was not found.",
          },

          404,
        ),
      );
    }


    await db.customerFavorite.deleteMany({
      where: {
        shop,

        shopifyCustomerId:
          customerId,

        sellerProductId:
          sellerProduct.id,
      },
    });


    return cors(
      json({
        success:
          true,

        authenticated:
          true,

        productGid,
      }),
    );
  };