import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import db from "../db.server";

import {
  requireSellerSession,
} from "../seller-session.server";

import {
  decryptShopifyToken,
  sellerShopifyGraphql,
} from "../seller-shopify.server";

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  descriptionHtml: string;
  productType: string;
  vendor: string;

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

  variants: {
    nodes: Array<{
      id: string;
      title: string;
      sku:
        | string
        | null;
      price: string;
      inventoryQuantity:
        | number
        | null;
      selectedOptions:
        Array<{
          name: string;
          value: string;
        }>;
    }>;
  };
};

type ProductsQuery = {
  products: {
    nodes:
      ProductNode[];

    pageInfo: {
      hasNextPage:
        boolean;
      endCursor:
        | string
        | null;
    };
  };
};

async function loadAllActiveProducts(
  shopDomain: string,
  accessToken: string,
) {
  const products:
    ProductNode[] = [];

  let after:
    string |
    null = null;

  let hasNextPage =
    true;

  while (
    hasNextPage
  ) {
    const data =
      await sellerShopifyGraphql<
        ProductsQuery
      >(
        shopDomain,
        accessToken,
        `#graphql
        query HairGrabExternalSellerProducts(
          $after: String
        ) {
          products(
            first: 100
            after: $after
            query: "status:active"
            sortKey: TITLE
          ) {
            nodes {
              id
              title
              handle
              status
              descriptionHtml
              productType
              vendor

              featuredMedia {
                preview {
                  image {
                    url
                    altText
                  }
                }
              }

              variants(first: 250) {
                nodes {
                  id
                  title
                  sku
                  price
                  inventoryQuantity

                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }

            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        `,
        {
          after,
        },
      );

    products.push(
      ...data.products.nodes,
    );

    hasNextPage =
      Boolean(
        data.products
          .pageInfo
          .hasNextPage,
      );

    after =
      data.products
        .pageInfo
        .endCursor;

    if (
      hasNextPage &&
      !after
    ) {
      throw new Error(
        "Shopify product pagination stopped because no next cursor was returned.",
      );
    }
  }

  return products;
}

export const loader =
  async ({
    request,
  }: LoaderFunctionArgs) => {
    const {
      seller,
    } =
      await requireSellerSession(
        request,
      );

    const connection =
      await db
        .sellerShopifyConnection
        .findUnique({
          where: {
            sellerId:
              seller.id,
          },
        });

    if (
      !connection ||
      connection.status !==
        "CONNECTED" ||
      !connection
        .accessTokenEncrypted
    ) {
      return {
        seller: {
          businessName:
            seller.businessName,
          sellerCode:
            seller.sellerCode,
        },

        connected:
          false,

        shopDomain:
          null,

        shopName:
          null,

        products:
          [] as ProductNode[],

        error:
          null as
            | string
            | null,
      };
    }

    try {
      const accessToken =
        decryptShopifyToken(
          connection
            .accessTokenEncrypted,
        );

      const products =
        await loadAllActiveProducts(
          connection.shopDomain,
          accessToken,
        );

      await db
        .sellerShopifyConnection
        .update({
          where: {
            sellerId:
              seller.id,
          },

          data: {
            lastSyncAt:
              new Date(),

            lastError:
              null,
          },
        });

      return {
        seller: {
          businessName:
            seller.businessName,
          sellerCode:
            seller.sellerCode,
        },

        connected:
          true,

        shopDomain:
          connection.shopDomain,

        shopName:
          connection.shopName,

        products,

        error:
          null as
            | string
            | null,
      };
    } catch (
      error
    ) {
      const message =
        error instanceof
        Error
          ? error.message
          : "Unable to read Shopify products.";

      await db
        .sellerShopifyConnection
        .update({
          where: {
            sellerId:
              seller.id,
          },

          data: {
            status:
              "ERROR",

            lastError:
              message,
          },
        });

      return {
        seller: {
          businessName:
            seller.businessName,
          sellerCode:
            seller.sellerCode,
        },

        connected:
          false,

        shopDomain:
          connection.shopDomain,

        shopName:
          connection.shopName,

        products:
          [] as ProductNode[],

        error:
          message,
      };
    }
  };

function moneyRange(
  product:
    ProductNode,
) {
  const values =
    product.variants.nodes
      .map(
        (variant) =>
          Number(
            variant.price,
          ),
      )
      .filter(
        (value) =>
          Number.isFinite(
            value,
          ),
      );

  if (
    values.length ===
    0
  ) {
    return "—";
  }

  const min =
    Math.min(
      ...values,
    );

  const max =
    Math.max(
      ...values,
    );

  const format =
    (value:
      number) =>
      new Intl.NumberFormat(
        "en-US",
        {
          style:
            "currency",
          currency:
            "USD",
        },
      ).format(value);

  return min === max
    ? format(min)
    : `${format(min)} – ${format(max)}`;
}

function totalInventory(
  product:
    ProductNode,
) {
  const quantities =
    product.variants.nodes
      .map(
        (variant) =>
          variant.inventoryQuantity,
      )
      .filter(
        (
          value,
        ): value is number =>
          typeof value ===
          "number",
      );

  if (
    quantities.length ===
    0
  ) {
    return "Not tracked";
  }

  return quantities
    .reduce(
      (sum, value) =>
        sum + value,
      0,
    )
    .toString();
}

export default function SellerShopifyProductsPage() {
  const data =
    useLoaderData<
      typeof loader
    >();

  return (
    <div
      style={{
        minHeight:
          "100vh",
        background:
          "#faf8fc",
        padding:
          "28px 18px 70px",
        fontFamily:
          "Arial, Helvetica, sans-serif",
        color:
          "#21152a",
      }}
    >
      <div
        style={{
          maxWidth:
            "980px",
          margin:
            "0 auto",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            gap:
              "12px",
            alignItems:
              "center",
            flexWrap:
              "wrap",
          }}
        >
          <Link
            to="/seller/shopify"
            style={{
              color:
                "#4B1678",
              textDecoration:
                "none",
              fontWeight:
                800,
              fontSize:
                "12px",
            }}
          >
            ← Shopify Connection
          </Link>

          <Link
            to="/seller"
            style={{
              color:
                "#4B1678",
              textDecoration:
                "none",
              fontWeight:
                800,
              fontSize:
                "12px",
            }}
          >
            Dashboard
          </Link>
        </div>

        <div
          style={{
            marginTop:
              "12px",
            background:
              "white",
            border:
              "1px solid #e6ddea",
            borderRadius:
              "18px",
            padding:
              "24px",
          }}
        >
          <div
            style={{
              color:
                "#4B1678",
              fontSize:
                "12px",
              fontWeight:
                800,
            }}
          >
            {data.seller.businessName} · {data.seller.sellerCode}
          </div>

          <h1
            style={{
              margin:
                "8px 0 5px",
              color:
                "#4B1678",
            }}
          >
            Active Shopify Products
          </h1>

          {data.connected && (
            <p
              style={{
                color:
                  "#6d6172",
                marginTop:
                  0,
              }}
            >
              {data.products.length} active product{data.products.length === 1 ? "" : "s"} found in {data.shopName || data.shopDomain}.
            </p>
          )}

          {!data.connected && (
            <div
              style={{
                background:
                  "#fff4e5",
                color:
                  "#7a4d00",
                borderRadius:
                  "10px",
                padding:
                  "13px",
                marginTop:
                  "16px",
              }}
            >
              {data.error ||
                "Connect a Shopify store before loading products."}
              <div
                style={{
                  marginTop:
                    "10px",
                }}
              >
                <Link
                  to="/seller/shopify"
                  style={{
                    color:
                      "#4B1678",
                    fontWeight:
                      800,
                  }}
                >
                  Return to Shopify Connection
                </Link>
              </div>
            </div>
          )}

          {data.connected &&
            data.products.length ===
              0 && (
              <div
                style={{
                  marginTop:
                    "18px",
                  background:
                    "#f3eef6",
                  color:
                    "#4B1678",
                  borderRadius:
                    "10px",
                  padding:
                    "14px",
                }}
              >
                No ACTIVE Shopify products were found. Draft and archived products are intentionally excluded.
              </div>
            )}

          {data.connected &&
            data.products.length >
              0 && (
              <div
                style={{
                  display:
                    "grid",
                  gap:
                    "12px",
                  marginTop:
                    "18px",
                }}
              >
                {data.products.map(
                  (
                    product,
                  ) => {
                    const image =
                      product
                        .featuredMedia
                        ?.preview
                        ?.image;

                    return (
                      <div
                        key={
                          product.id
                        }
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "72px minmax(0, 1fr)",
                          gap:
                            "14px",
                          border:
                            "1px solid #e6ddea",
                          borderRadius:
                            "14px",
                          padding:
                            "12px",
                          alignItems:
                            "center",
                        }}
                      >
                        <div
                          style={{
                            width:
                              "72px",
                            height:
                              "72px",
                            borderRadius:
                              "10px",
                            overflow:
                              "hidden",
                            background:
                              "#f3eef6",
                            display:
                              "flex",
                            alignItems:
                              "center",
                            justifyContent:
                              "center",
                            color:
                              "#4B1678",
                            fontWeight:
                              800,
                            fontSize:
                              "11px",
                            textAlign:
                              "center",
                          }}
                        >
                          {image?.url ? (
                            <img
                              src={
                                image.url
                              }
                              alt={
                                image.altText ||
                                product.title
                              }
                              style={{
                                width:
                                  "100%",
                                height:
                                  "100%",
                                objectFit:
                                  "cover",
                              }}
                            />
                          ) : (
                            "No image"
                          )}
                        </div>

                        <div
                          style={{
                            minWidth:
                              0,
                          }}
                        >
                          <div
                            style={{
                              fontWeight:
                                900,
                              color:
                                "#2e2034",
                              overflowWrap:
                                "anywhere",
                            }}
                          >
                            {product.title}
                          </div>

                          <div
                            style={{
                              marginTop:
                                "6px",
                              display:
                                "flex",
                              gap:
                                "10px",
                              flexWrap:
                                "wrap",
                              fontSize:
                                "12px",
                              color:
                                "#6d6172",
                            }}
                          >
                            <span>
                              {product.variants.nodes.length} variant{product.variants.nodes.length === 1 ? "" : "s"}
                            </span>

                            <span>
                              {moneyRange(
                                product,
                              )}
                            </span>

                            <span>
                              Inventory: {totalInventory(
                                product,
                              )}
                            </span>

                            {product.productType && (
                              <span>
                                {product.productType}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
