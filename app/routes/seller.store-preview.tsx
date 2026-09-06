import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { requireSellerSession } from "../seller-session.server";


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

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
        8,
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
    const offlineSession =
      await db.session.findFirst({
        where: {
          isOnline:
            false,
        },
      });

    if (
      offlineSession
    ) {
      const {
        admin,
      } =
        await unauthenticated.admin(
          offlineSession.shop,
        );

      const response =
        await admin.graphql(
          `#graphql
          query HairGrabStorePreviewProducts(
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
            node?.variants
              ?.nodes ||
            []
          )
            .map(
              (
                variant:
                  any,
              ) =>
                Number(
                  variant
                    ?.price ||
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

          const formatted =
            new Intl.NumberFormat(
              "en-US",
              {
                style:
                  "currency",
                currency:
                  "USD",
              },
            );

          price =
            min === max
              ? formatted.format(
                  min,
                )
              : `From ${formatted.format(
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

          shopifyHandle:
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


export default function SellerStorePreviewPage() {
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
      <div
        style={{
          background:
            "#4B1678",

          color:
            "white",

          padding:
            "12px 18px",
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

            flexWrap:
              "wrap",
          }}
        >
          <div
            style={{
              fontSize:
                "12px",

              fontWeight:
                "800",

              letterSpacing:
                ".4px",
            }}
          >
            Storefront Preview
          </div>

          <Link
            to="/seller/settings"
            style={{
              background:
                "white",

              color:
                "#4B1678",

              borderRadius:
                "8px",

              padding:
                "9px 12px",

              textDecoration:
                "none",

              fontSize:
                "11px",

              fontWeight:
                "800",
            }}
          >
            ← Back to Store Settings
          </Link>
        </div>
      </div>

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
                Banner image will appear here
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
                  Store Logo
                </div>
              )}
            </div>

            <div>

              <h1
                style={{
                  margin:
                    "4px 0 6px",

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
                  "Your store description will appear here."}
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
                Products
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
                Shopper view of active products from this store.
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
              {products.length} shown
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
              Active products will appear here.
            </div>
          ) : (
            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(auto-fit, minmax(190px, 1fr))",

                gap:
                  "14px",
              }}
            >
              {products.map(
                (product) => (
                  <div
                    key={
                      product.id
                    }
                    style={{
                      background:
                        "white",

                      border:
                        "1px solid #eadff0",

                      borderRadius:
                        "12px",

                      padding:
                        "14px",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio:
                          "1 / 1",

                        borderRadius:
                          "9px",

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
                        marginTop:
                          "10px",

                        fontWeight:
                          "800",

                        fontSize:
                          "13px",
                      }}
                    >
                      {product.title}
                    </div>

                    {product.price && (
                      <div
                        style={{
                          marginTop:
                            "6px",

                          color:
                            "#4B1678",

                          fontWeight:
                            "800",

                          fontSize:
                            "12px",
                        }}
                      >
                        {product.price}
                      </div>
                    )}

                    {product.shopifyHandle && (
                      <a
                        href={`https://hairgrab.com/products/${product.shopifyHandle}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display:
                            "inline-block",

                          marginTop:
                            "8px",

                          color:
                            "#4B1678",

                          textDecoration:
                            "none",

                          fontSize:
                            "11px",

                          fontWeight:
                            "800",
                        }}
                      >
                        View Product →
                      </a>
                    )}
                  </div>
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

