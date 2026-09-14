import type {
  LoaderFunctionArgs,
} from "react-router";

import {
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

        storefrontPublished:
          true,
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
        onSale: boolean;
        regularPrice: string;
        shipsWithin: string;
        shippingMethod: string;
        flatRateShipping: string;
        localPickupAvailable: boolean;
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

              customMetafields: metafields(first: 50, namespace: "custom") {
                nodes {
                  key
                  value
                }
              }

              hairgrabMetafields: metafields(first: 20, namespace: "hairgrab") {
                nodes {
                  key
                  value
                }
              }

              featuredImage {
                url
                altText
              }

              variants(first: 100) {
                nodes {
                  price
                  compareAtPrice
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

      const variantNodes =
        (
          node
            ?.variants
            ?.nodes ||
          []
        ) as Array<{
          price?: string;
          compareAtPrice?: string | null;
        }>;

      const prices =
        variantNodes
          .map(
            (variant) =>
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

      // A product is "on sale" when at least one variant has a
      // compareAtPrice higher than its current price. Kept
      // consistent with seller.store-preview.tsx so the public
      // storefront and the seller's private preview never
      // disagree about sale state.
      const onSale =
        variantNodes.some(
          (variant) => {
            const variantPrice =
              Number(
                variant?.price ||
                0,
              );

            const compareAt =
              Number(
                variant?.compareAtPrice ||
                0,
              );

            return (
              compareAt > 0 &&
              variantPrice > 0 &&
              compareAt > variantPrice
            );
          },
        );

      const compareAtPrices =
        variantNodes
          .map((variant) =>
            Number(
              variant?.compareAtPrice ||
              0,
            ),
          )
          .filter(
            (value) =>
              Number.isFinite(value) &&
              value > 0,
          );

      const regularPrice =
        onSale && compareAtPrices.length > 0
          ? (() => {
              const min = Math.min(...compareAtPrices);
              const max = Math.max(...compareAtPrices);

              return min === max
                ? formatMoney(min)
                : `From ${formatMoney(min)}`;
            })()
          : "";

      // Ships Within / shipping label / local pickup are read from
      // the same Shopify metafields as app/routes/seller.store-preview.tsx,
      // so the public storefront and the seller's private preview
      // never disagree about this product-level fulfillment info.
      const customMetafields =
        new Map<string, string>(
          (
            node?.customMetafields
              ?.nodes ||
            []
          ).map(
            (metafield: any) => [
              String(
                metafield?.key ||
                "",
              ).toLowerCase(),
              String(
                metafield?.value ||
                "",
              ),
            ],
          ),
        );

      const hairgrabMetafields =
        new Map<string, string>(
          (
            node?.hairgrabMetafields
              ?.nodes ||
            []
          ).map(
            (metafield: any) => [
              String(
                metafield?.key ||
                "",
              ).toLowerCase(),
              String(
                metafield?.value ||
                "",
              ),
            ],
          ),
        );

      const customValue = (
        ...keys: string[]
      ) => {
        for (const key of keys) {
          const value =
            customMetafields.get(
              key.toLowerCase(),
            );

          if (value) {
            return value;
          }
        }

        return "";
      };

      const hairgrabValue = (
        key: string,
      ) =>
        hairgrabMetafields.get(
          key.toLowerCase(),
        ) || "";

      const rawLocalPickup =
        hairgrabValue(
          "local_pickup_available",
        );

      const shipsWithin =
        customValue(
          "ships_within",
          "ships_within_24_hours",
          "field-1788095152116",
        );

      const shippingMethod =
        hairgrabValue(
          "shipping_charge_type",
        ) ||
        customValue(
          "shipping_method_shipping_options",
          "shipping_method_shipping",
          "shipping_method",
          "shipping_methods",
          "field-1788297161425",
        );

      const flatRateShipping =
        hairgrabValue(
          "flat_rate_shipping",
        );

      const localPickupAvailable =
        rawLocalPickup === "true" ||
        rawLocalPickup === "1";

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
          onSale,
          regularPrice,
          shipsWithin,
          shippingMethod,
          flatRateShipping,
          localPickupAvailable,
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

          onSale:
            shopifyProduct
              ?.onSale ||
            false,

          regularPrice:
            shopifyProduct
              ?.regularPrice ||
            "",

          shipsWithin:
            shopifyProduct
              ?.shipsWithin ||
            "",

          shippingMethod:
            shopifyProduct
              ?.shippingMethod ||
            "",

          flatRateShipping:
            shopifyProduct
              ?.flatRateShipping ||
            "",

          localPickupAvailable:
            Boolean(
              shopifyProduct
                ?.localPickupAvailable,
            ),
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
          <a
            // Absolute + branded rather than a relative <Link>, so
            // this link can never inherit an unbranded host (e.g.
            // a raw Railway domain) if this storefront page is ever
            // reached through one. Matches the same hardening applied
            // to app/routes/sellers.tsx's "View Store" links.
            href="https://shops.hairgrab.com/sellers"
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
          </a>

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
              width:
                "100%",

              // Same banner aspect ratio as Store Preview
              // (app/routes/seller.store-preview.tsx) and the
              // /sellers directory instead of a short fixed
              // height — that fixed height was cropping the
              // bottom of the banner off here.
              aspectRatio:
                "4 / 1",

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

                  objectPosition:
                    "center",

                  display:
                    "block",
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
                  "repeat(auto-fill, minmax(190px, 220px))",

                justifyContent:
                  "start",

                gap:
                  "14px",
              }}
            >
              {products.map(
                (product) => {
                  const shippingLine =
                    product.shippingMethod ===
                      "Free Shipping"
                      ? "Free Shipping"
                      : product.shippingMethod ===
                            "Flat Rate Shipping" &&
                          product.flatRateShipping
                        ? `$${Number(
                            product.flatRateShipping,
                          ).toFixed(2)} Flat Rate`
                        : product.shippingMethod;

                  return (
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
                            display:
                              "flex",

                            alignItems:
                              "baseline",

                            gap:
                              "6px",

                            flexWrap:
                              "wrap",

                            marginTop:
                              "7px",
                          }}
                        >
                          <span
                            style={{
                              color:
                                "#4B1678",

                              fontWeight:
                                "800",

                              fontSize:
                                "13px",
                            }}
                          >
                            {product.price}
                          </span>

                          {product.onSale &&
                            product.regularPrice && (
                              <span
                                style={{
                                  color:
                                    "#948a9c",

                                  fontSize:
                                    "11px",

                                  textDecoration:
                                    "line-through",
                                }}
                              >
                                {product.regularPrice}
                              </span>
                            )}

                          {product.onSale && (
                            <span
                              style={{
                                color:
                                  "#4B1678",

                                background:
                                  "#f3e6c8",

                                fontSize:
                                  "9px",

                                fontWeight:
                                  "800",

                                letterSpacing:
                                  "0.03em",

                                textTransform:
                                  "uppercase",

                                padding:
                                  "2px 6px",

                                borderRadius:
                                  "5px",
                              }}
                            >
                              Sale
                            </span>
                          )}
                        </div>
                      )}

                      {product.shipsWithin && (
                        <div
                          style={{
                            display:
                              "flex",

                            alignItems:
                              "center",

                            gap:
                              "6px",

                            marginTop:
                              "9px",

                            color:
                              "#5f5564",

                            fontSize:
                              "9px",

                            fontWeight:
                              700,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              color:
                                "#4B1678",
                            }}
                          >
                            🚚
                          </span>

                          Ships within{" "}
                          {product.shipsWithin}
                        </div>
                      )}

                      {shippingLine && (
                        <div
                          style={{
                            display:
                              "flex",

                            alignItems:
                              "center",

                            gap:
                              "6px",

                            marginTop:
                              "6px",

                            color:
                              "#5f5564",

                            fontSize:
                              "9px",

                            fontWeight:
                              700,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              color:
                                "#4B1678",
                            }}
                          >
                            ▣
                          </span>

                          {shippingLine}
                        </div>
                      )}

                      {product.localPickupAvailable && (
                        <div
                          style={{
                            marginTop:
                              "8px",

                            display:
                              "inline-block",

                            background:
                              "#f4ecf9",

                            color:
                              "#4B1678",

                            border:
                              "1px solid #dfccec",

                            borderRadius:
                              "999px",

                            padding:
                              "5px 8px",

                            fontSize:
                              "8px",

                            fontWeight:
                              900,
                          }}
                        >
                          Local Pickup
                        </div>
                      )}
                    </div>
                  </a>
                  );
                },
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
