import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { unauthenticated } from "../shopify.server";


function slugify(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(
      /^-+|-+$/g,
      "",
    );
}


async function getShopifyAdmin() {
  const offlineSession =
    await db.session.findFirst({
      where: {
        isOnline:
          false,
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


function formatMoney(
  amount: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",
    },
  ).format(amount);
}


export const loader = async ({
  params,
}: LoaderFunctionArgs) => {
  const requestedSlug =
    String(
      params.storeSlug ||
      "",
    )
      .trim()
      .toLowerCase();

  if (!requestedSlug) {
    throw new Response(
      "Seller storefront not found.",
      {
        status:
          404,
      },
    );
  }

  const sellers =
    await db.seller.findMany({
      where: {
        status:
          "ACTIVE",
      },
    });

  const seller =
    sellers.find(
      (candidate) =>
        (
          candidate.storeSlug ||
          slugify(
            candidate.businessName,
          )
        ).toLowerCase() ===
        requestedSlug,
    );

  if (!seller) {
    throw new Response(
      "Seller storefront not found.",
      {
        status:
          404,
      },
    );
  }

  const ownedProducts =
    await db.sellerProduct.findMany({
      where: {
        sellerId:
          seller.id,

        status:
          "ACTIVE",
      },

      select: {
        id:
          true,

        title:
          true,

        shopifyProductId:
          true,

        shopifyHandle:
          true,
      },

      orderBy: {
        updatedAt:
          "desc",
      },

      take:
        24,
    });

  const shopifyIds =
    ownedProducts
      .map(
        (product) =>
          product.shopifyProductId,
      )
      .filter(
        (
          id,
        ): id is string =>
          Boolean(id),
      );

  const shopifyById =
    new Map<
      string,
      {
        title: string;
        handle: string;
        imageUrl: string | null;
        imageAlt: string;
        price: string;
      }
    >();

  if (
    shopifyIds.length >
    0
  ) {
    const {
      admin,
    } =
      await getShopifyAdmin();

    const response =
      await admin.graphql(
        `#graphql
        query HairGrabPublicSellerProducts(
          $ids: [ID!]!
        ) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              handle

              featuredImage {
                url
                altText
              }

              variants(first: 100) {
                nodes {
                  price
                }
              }
            }
          }
        }
        `,
        {
          variables: {
            ids:
              shopifyIds,
          },
        },
      );

    const json =
      await response.json();

    if (
      json?.errors &&
      json.errors.length >
        0
    ) {
      throw new Error(
        json.errors
          .map(
            (
              error: {
                message?: string;
              },
            ) =>
              error.message ||
              "Unable to load seller products.",
          )
          .join(" | "),
      );
    }

    for (
      const node of
      json?.data?.nodes ||
      []
    ) {
      if (!node?.id) {
        continue;
      }

      const prices =
        (
          node
            ?.variants
            ?.nodes ||
          []
        )
          .map(
            (
              variant:
                any,
            ) =>
              Number(
                variant?.price ||
                0,
              ),
          )
          .filter(
            (
              price:
                number,
            ) =>
              Number.isFinite(
                price,
              ),
          );

      let price =
        "";

      if (
        prices.length >
        0
      ) {
        const min =
          Math.min(
            ...prices,
          );

        const max =
          Math.max(
            ...prices,
          );

        price =
          min === max
            ? formatMoney(
                min,
              )
            : `From ${formatMoney(
                min,
              )}`;
      }

      shopifyById.set(
        String(
          node.id,
        ),
        {
          title:
            String(
              node.title ||
              "",
            ),

          handle:
            String(
              node.handle ||
              "",
            ),

          imageUrl:
            node
              .featuredImage
              ?.url ||
            null,

          imageAlt:
            node
              .featuredImage
              ?.altText ||
            node.title ||
            "HairGrab product",

          price,
        },
      );
    }
  }

  const products =
    ownedProducts.map(
      (product) => {
        const shopifyProduct =
          product.shopifyProductId
            ? shopifyById.get(
                product.shopifyProductId,
              )
            : undefined;

        return {
          id:
            product.id,

          title:
            shopifyProduct
              ?.title ||
            product.title,

          handle:
            shopifyProduct
              ?.handle ||
            product.shopifyHandle ||
            "",

          imageUrl:
            shopifyProduct
              ?.imageUrl ||
            null,

          imageAlt:
            shopifyProduct
              ?.imageAlt ||
            product.title,

          price:
            shopifyProduct
              ?.price ||
            "",
        };
      },
    );

  return {
    seller: {
      businessName:
        seller.businessName,

      storeDescription:
        seller.storeDescription ||
        "",

      logoUrl:
        seller.logoUrl ||
        "",

      bannerUrl:
        seller.bannerUrl ||
        "",

      sellsNationwide:
        seller.sellsNationwide,

      offersLocalPickup:
        seller.offersLocalPickup,

      offersLocalDelivery:
        seller.offersLocalDelivery,
    },

    products,
  };
};


export default function PublicSellerStorefrontPage() {
  const {
    seller,
    products,
  } =
    useLoaderData<
      typeof loader
    >();

  return (
    <div
      style={{
        minHeight:
          "100vh",

        background:
          "#ffffff",

        fontFamily:
          "Arial, Helvetica, sans-serif",

        color:
          "#21152a",
      }}
    >
      <header
        style={{
          borderBottom:
            "1px solid #eee6f2",

          background:
            "#ffffff",

          padding:
            "14px 18px",
        }}
      >
        <div
          style={{
            maxWidth:
              "1180px",

            margin:
              "0 auto",

            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap:
              "12px",
          }}
        >
          <Link
            to="/sellers"
            style={{
              color:
                "#4B1678",

              textDecoration:
                "none",

              fontWeight:
                "800",

              fontSize:
                "12px",
            }}
          >
            ← All Sellers
          </Link>

          <a
            href="https://hairgrab.com"
            style={{
              color:
                "#4B1678",

              textDecoration:
                "none",

              fontWeight:
                "800",

              fontSize:
                "12px",
            }}
          >
            HairGrab
          </a>
        </div>
      </header>

      <main
        style={{
          maxWidth:
            "1180px",

          margin:
            "0 auto",

          padding:
            "24px 18px 60px",
        }}
      >
        <section
          style={{
            border:
              "1px solid #eadff0",

            borderRadius:
              "16px",

            overflow:
              "hidden",

            background:
              "#faf8fc",
          }}
        >
          <div
            style={{
              height:
                "220px",

              background:
                seller.bannerUrl
                  ? "#f3edf7"
                  : "linear-gradient(135deg, #f5edf9, #eee3f5)",

              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              overflow:
                "hidden",
            }}
          >
            {seller.bannerUrl ? (
              <img
                src={
                  seller.bannerUrl
                }
                alt={`${seller.businessName} banner`}
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
              <div
                style={{
                  color:
                    "#7b6c82",

                  fontSize:
                    "13px",

                  fontWeight:
                    "700",
                }}
              >
                {seller.businessName}
              </div>
            )}
          </div>

          <div
            style={{
              padding:
                "22px",

              display:
                "grid",

              gridTemplateColumns:
                "110px minmax(0, 1fr)",

              gap:
                "18px",

              alignItems:
                "start",
            }}
          >
            <div
              style={{
                width:
                  "110px",

                height:
                  "110px",

                borderRadius:
                  "16px",

                border:
                  "1px solid #e4d6eb",

                background:
                  "white",

                overflow:
                  "hidden",

                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "center",
              }}
            >
              {seller.logoUrl ? (
                <img
                  src={
                    seller.logoUrl
                  }
                  alt={`${seller.businessName} logo`}
                  style={{
                    width:
                      "100%",

                    height:
                      "100%",

                    objectFit:
                      "contain",
                  }}
                />
              ) : (
                <div
                  style={{
                    color:
                      "#8a7b91",

                    fontSize:
                      "11px",

                    textAlign:
                      "center",

                    padding:
                      "10px",
                  }}
                >
                  {seller.businessName}
                </div>
              )}
            </div>

            <div>
              <h1
                style={{
                  margin:
                    "0 0 8px",

                  color:
                    "#4B1678",

                  fontSize:
                    "30px",
                }}
              >
                {seller.businessName}
              </h1>

              <div
                style={{
                  color:
                    "#4f4554",

                  fontSize:
                    "13px",

                  lineHeight:
                    1.6,

                  maxWidth:
                    "760px",
                }}
              >
                {seller.storeDescription ||
                  "Discover products from this HairGrab seller."}
              </div>

              <div
                style={{
                  display:
                    "flex",

                  gap:
                    "8px",

                  flexWrap:
                    "wrap",

                  marginTop:
                    "15px",
                }}
              >
                {seller.sellsNationwide && (
                  <Badge>
                    Ships Nationwide
                  </Badge>
                )}

                {seller.offersLocalPickup && (
                  <Badge>
                    Local Pickup
                  </Badge>
                )}

                {seller.offersLocalDelivery && (
                  <Badge>
                    Local Delivery
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            marginTop:
              "26px",
          }}
        >
          <div
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              alignItems:
                "end",

              gap:
                "12px",

              flexWrap:
                "wrap",

              marginBottom:
                "14px",
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    0,

                  color:
                    "#4B1678",

                  fontSize:
                    "22px",
                }}
              >
                Shop {seller.businessName}
              </h2>

              <div
                style={{
                  color:
                    "#756b79",

                  fontSize:
                    "12px",

                  marginTop:
                    "4px",
                }}
              >
                Products available on HairGrab.
              </div>
            </div>

            <div
              style={{
                color:
                  "#4B1678",

                fontWeight:
                  "800",

                fontSize:
                  "12px",
              }}
            >
              {products.length} {products.length === 1 ? "product" : "products"}
            </div>
          </div>

          {products.length ===
          0 ? (
            <div
              style={{
                border:
                  "1px solid #eadff0",

                borderRadius:
                  "14px",

                padding:
                  "34px 20px",

                textAlign:
                  "center",

                color:
                  "#756b79",

                background:
                  "#faf8fc",

                fontSize:
                  "13px",
              }}
            >
              This seller does not have active products yet.
            </div>
          ) : (
            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(auto-fill, minmax(190px, 1fr))",

                gap:
                  "14px",
              }}
            >
              {products.map(
                (product) => (
                  <a
                    key={
                      product.id
                    }
                    href={
                      product.handle
                        ? `https://hairgrab.com/products/${product.handle}`
                        : "#"
                    }
                    style={{
                      color:
                        "inherit",

                      textDecoration:
                        "none",

                      background:
                        "white",

                      border:
                        "1px solid #eadff0",

                      borderRadius:
                        "12px",

                      overflow:
                        "hidden",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio:
                          "1 / 1",

                        background:
                          "#f5f1f7",

                        display:
                          "flex",

                        alignItems:
                          "center",

                        justifyContent:
                          "center",

                        overflow:
                          "hidden",
                      }}
                    >
                      {product.imageUrl ? (
                        <img
                          src={
                            product.imageUrl
                          }
                          alt={
                            product.imageAlt
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
                        <div
                          style={{
                            color:
                              "#8a7b91",

                            fontSize:
                              "11px",

                            textAlign:
                              "center",

                            padding:
                              "10px",
                          }}
                        >
                          No product image
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        padding:
                          "12px",
                      }}
                    >
                      <div
                        style={{
                          fontWeight:
                            "800",

                          fontSize:
                            "13px",

                          lineHeight:
                            1.35,
                        }}
                      >
                        {product.title}
                      </div>

                      {product.price && (
                        <div
                          style={{
                            color:
                              "#4B1678",

                            fontWeight:
                              "800",

                            fontSize:
                              "13px",

                            marginTop:
                              "7px",
                          }}
                        >
                          {product.price}
                        </div>
                      )}
                    </div>
                  </a>
                ),
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}


function Badge({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <span
      style={{
        background:
          "#f2eafa",

        color:
          "#4B1678",

        borderRadius:
          "20px",

        padding:
          "6px 9px",

        fontSize:
          "10px",

        fontWeight:
          "800",
      }}
    >
      {children}
    </span>
  );
}
