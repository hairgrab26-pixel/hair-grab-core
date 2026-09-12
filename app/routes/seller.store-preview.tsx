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


type ShopifyProductInfo = {
  title: string;
  handle: string;
  imageUrl: string | null;
  imageAlt: string;
  price: string;
  onSale: boolean;
};


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  const [
    ownedProducts,
    sellerPicks,
  ] =
    await Promise.all([
      db.sellerProduct.findMany({
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

          createdAt:
            true,

          updatedAt:
            true,
        },

        orderBy: {
          createdAt:
            "desc",
        },
      }),

      db.sellerHomepagePick.findMany({
        where: {
          sellerId:
            seller.id,
        },

        orderBy: {
          rank:
            "asc",
        },

        select: {
          sellerProductId:
            true,
        },
      }),
    ]);

  const shopifyIds =
    ownedProducts
      .map(
        (
          product,
        ) =>
          product.shopifyProductId,
      )
      .filter(
        (
          id,
        ): id is string =>
          Boolean(
            id,
          ),
      );

  const shopifyById =
    new Map<
      string,
      ShopifyProductInfo
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
      try {
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

        for (
          const node of
          json?.data?.nodes ||
          []
        ) {
          if (
            !node?.id
          ) {
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
                  ) &&
                  price >
                    0,
              );

          const onSale =
            (
              node?.variants
                ?.nodes ||
              []
            ).some(
              (
                variant:
                  any,
              ) => {
                const price =
                  Number(
                    variant
                      ?.price ||
                    0,
                  );

                const compareAt =
                  Number(
                    variant
                      ?.compareAtPrice ||
                    0,
                  );

                return (
                  compareAt >
                    0 &&
                  price >
                    0 &&
                  compareAt >
                    price
                );
              },
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
              onSale,
            },
          );
        }
      } catch (
        error
      ) {
        console.error(
          "[HairGrab Core] Store preview Shopify product lookup failed:",
          error,
        );
      }
    }
  }

  const featuredIds =
    new Set(
      sellerPicks.map(
        (
          pick,
        ) =>
          pick.sellerProductId,
      ),
    );

  const products =
    ownedProducts.map(
      (
        product,
      ) => {
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

          onSale:
            Boolean(
              shopifyProduct
                ?.onSale,
            ),

          featured:
            featuredIds.has(
              product.id,
            ),

          createdAt:
            product.createdAt.toISOString(),
        };
      },
    );

  const newArrivalCutoff =
    Date.now() -
    45 *
      24 *
      60 *
      60 *
      1000;

  return {
    seller: {
      businessName:
        seller.businessName,

      sellerCode:
        seller.sellerCode,

      storeDescription:
        seller.storeDescription ||
        "",

      logoUrl:
        seller.logoUrl ||
        "",

      bannerUrl:
        seller.bannerUrl ||
        "",

      city:
        seller.city ||
        "",

      state:
        seller.state ||
        "",

      sellsNationwide:
        seller.sellsNationwide,

      offersLocalPickup:
        seller.offersLocalPickup,

      offersLocalDelivery:
        seller.offersLocalDelivery,

      offersSameDayDelivery:
        seller.offersSameDayDelivery,

      returnPolicy:
        seller.returnPolicy ||
        "14_DAY_RETURNS",
    },

    products:
      products.map(
        (
          product,
        ) => ({
          ...product,

          isNew:
            new Date(
              product.createdAt,
            ).getTime() >=
            newArrivalCutoff,
        }),
      ),
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

  const location =
    [
      seller.city,
      seller.state,
    ]
      .filter(
        Boolean,
      )
      .join(
        ", ",
      );

  const featured =
    products.filter(
      (
        product,
      ) =>
        product.featured,
    );

  const newArrivals =
    products
      .filter(
        (
          product,
        ) =>
          product.isNew,
      )
      .slice(
        0,
        8,
      );

  const onSale =
    products.filter(
      (
        product,
      ) =>
        product.onSale,
    );

  const returnPolicyLabel =
    seller.returnPolicy ===
    "FINAL_SALE"
      ? "Final Sale"
      : "14-Day Returns";

  return (
    <div
      style={{
        minHeight:
          "100vh",

        background:
          "#F7F2FA",

        color:
          "#21152a",

        fontFamily:
          "Arial, Helvetica, sans-serif",
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          .hg-preview-main {
            padding: 14px 12px 50px !important;
          }

          .hg-preview-banner {
            height: 150px !important;
          }

          .hg-preview-profile {
            grid-template-columns: 78px minmax(0, 1fr) !important;
            gap: 12px !important;
            padding: 15px !important;
          }

          .hg-preview-logo {
            width: 78px !important;
            height: 78px !important;
            border-radius: 12px !important;
          }

          .hg-preview-name {
            font-size: 23px !important;
          }

          .hg-preview-nav {
            overflow-x: auto !important;
            flex-wrap: nowrap !important;
            justify-content: flex-start !important;
          }

          .hg-product-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }

          .hg-product-card {
            padding: 10px !important;
          }

          .hg-product-title {
            font-size: 12px !important;
          }

          .hg-two-column {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div
        style={{
          background:
            "#4B1678",

          color:
            "white",

          padding:
            "11px 15px",
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
              "10px",

            flexWrap:
              "wrap",
          }}
        >
          <div
            style={{
              fontSize:
                "11px",

              fontWeight:
                900,
            }}
          >
            Storefront Preview
          </div>

          <div
            style={{
              display:
                "flex",

              gap:
                "8px",

              alignItems:
                "center",
            }}
          >
            <Link
              to="/seller/store"
              style={{
                color:
                  "white",

                textDecoration:
                  "none",

                fontSize:
                  "10px",

                fontWeight:
                  800,
              }}
            >
              Edit Store
            </Link>

            <Link
              to="/seller"
              style={{
                background:
                  "white",

                color:
                  "#4B1678",

                borderRadius:
                  "8px",

                padding:
                  "8px 10px",

                textDecoration:
                  "none",

                fontSize:
                  "10px",

                fontWeight:
                  900,
              }}
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <main
        className="hg-preview-main"
        style={{
          maxWidth:
            "1180px",

          margin:
            "0 auto",

          padding:
            "22px 18px 60px",
        }}
      >
        <section
          style={{
            background:
              "white",

            border:
              "1px solid #e5dce9",

            borderRadius:
              "16px",

            overflow:
              "hidden",
          }}
        >
          <div
            className="hg-preview-banner"
            style={{
              height:
                "230px",

              background:
                seller.bannerUrl
                  ? "#eee6f2"
                  : "linear-gradient(135deg, #e8d7f2, #f8f1fb)",

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
                    "#756b79",

                  fontWeight:
                    800,

                  fontSize:
                    "12px",
                }}
              >
                Brand banner
              </div>
            )}
          </div>

          <div
            className="hg-preview-profile"
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "105px minmax(0, 1fr)",

              gap:
                "18px",

              padding:
                "20px",

              alignItems:
                "start",
            }}
          >
            <div
              className="hg-preview-logo"
              style={{
                width:
                  "105px",

                height:
                  "105px",

                borderRadius:
                  "15px",

                border:
                  "1px solid #e2d6e7",

                overflow:
                  "hidden",

                background:
                  "white",

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
                      "10px",

                    fontWeight:
                      800,
                  }}
                >
                  Store Logo
                </div>
              )}
            </div>

            <div>
              <div
                style={{
                  color:
                    "#4B1678",

                  fontSize:
                    "10px",

                  fontWeight:
                    900,
                }}
              >
                VERIFIED HAIRGRAB SELLER · {seller.sellerCode}
              </div>

              <h1
                className="hg-preview-name"
                style={{
                  margin:
                    "5px 0 5px",

                  color:
                    "#4B1678",

                  fontSize:
                    "30px",

                  lineHeight:
                    1.08,
                }}
              >
                {seller.businessName}
              </h1>

              {location && (
                <div
                  style={{
                    color:
                      "#756b79",

                    fontSize:
                      "11px",

                    marginBottom:
                      "8px",
                  }}
                >
                  {location}
                </div>
              )}

              <div
                style={{
                  display:
                    "flex",

                  gap:
                    "7px",

                  flexWrap:
                    "wrap",

                  marginTop:
                    "10px",
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

                {seller.offersSameDayDelivery && (
                  <Badge>
                    Same-Day
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <nav
            className="hg-preview-nav"
            style={{
              display:
                "flex",

              justifyContent:
                "center",

              gap:
                "7px",

              flexWrap:
                "wrap",

              borderTop:
                "1px solid #eee5f1",

              padding:
                "10px 14px",

              background:
                "#fbf8fd",
            }}
          >
            {[
              ["Home", "#home"],
              ["Shop", "#shop"],
              ["Collections", "#collections"],
              ["About", "#about"],
              ["Reviews", "#reviews"],
              ["Policies", "#policies"],
            ].map(
              (
                [
                  label,
                  href,
                ],
              ) => (
                <a
                  key={
                    label
                  }
                  href={
                    href
                  }
                  style={{
                    color:
                      "#4B1678",

                    textDecoration:
                      "none",

                    fontSize:
                      "10px",

                    fontWeight:
                      900,

                    padding:
                      "6px 8px",

                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {label}
                </a>
              ),
            )}
          </nav>
        </section>

        <section
          id="home"
          style={{
            marginTop:
              "24px",
          }}
        >
          <SectionHeading
            title="Featured"
            subtitle="Seller-selected products."
          />

          {featured.length >
          0 ? (
            <ProductGrid
              products={
                featured
              }
            />
          ) : (
            <EmptyState text="Seller Picks will appear here." />
          )}
        </section>

        <section
          id="collections"
          style={{
            marginTop:
              "30px",
          }}
        >
          <SectionHeading
            title="Collections"
            subtitle="Automatically organized by HairGrab."
          />

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",

              gap:
                "12px",
            }}
          >
            <CollectionCard
              title="All Products"
              count={
                products.length
              }
              href="#shop"
            />

            <CollectionCard
              title="New Arrivals"
              count={
                newArrivals.length
              }
              href="#new-arrivals"
            />

            <CollectionCard
              title="On Sale"
              count={
                onSale.length
              }
              href="#on-sale"
            />

            <CollectionCard
              title="Featured"
              count={
                featured.length
              }
              href="#home"
            />
          </div>
        </section>

        {newArrivals.length >
          0 && (
          <section
            id="new-arrivals"
            style={{
              marginTop:
                "30px",
            }}
          >
            <SectionHeading
              title="New Arrivals"
              subtitle="Recently added to this HairGrab store."
            />

            <ProductGrid
              products={
                newArrivals
              }
            />
          </section>
        )}

        {onSale.length >
          0 && (
          <section
            id="on-sale"
            style={{
              marginTop:
                "30px",
            }}
          >
            <SectionHeading
              title="On Sale"
              subtitle="Current store deals."
            />

            <ProductGrid
              products={
                onSale
              }
            />
          </section>
        )}

        <section
          id="shop"
          style={{
            marginTop:
              "30px",
          }}
        >
          <SectionHeading
            title="Shop All"
            subtitle={`${products.length} active ${
              products.length === 1
                ? "product"
                : "products"
            }`}
          />

          {products.length >
          0 ? (
            <ProductGrid
              products={
                products
              }
            />
          ) : (
            <EmptyState text="Active products will appear here." />
          )}
        </section>

        <div
          className="hg-two-column"
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "1.35fr .65fr",

            gap:
              "16px",

            marginTop:
              "30px",
          }}
        >
          <section
            id="about"
            style={
              infoCardStyle
            }
          >
            <SectionHeading
              title="About the Brand"
              subtitle={seller.businessName}
            />

            <div
              style={{
                color:
                  "#4f4554",

                fontSize:
                  "12px",

                lineHeight:
                  1.7,
              }}
            >
              {seller.storeDescription ||
                "This seller has not added their brand story yet."}
            </div>
          </section>

          <section
            id="policies"
            style={
              infoCardStyle
            }
          >
            <SectionHeading
              title="Store Policies"
              subtitle="Easy to understand."
            />

            <PolicyRow
              label="Returns"
              value={
                returnPolicyLabel
              }
            />

            <PolicyRow
              label="Buyer Protection"
              value="HairGrab Protected"
            />

            {seller.sellsNationwide && (
              <PolicyRow
                label="Shipping"
                value="Nationwide"
              />
            )}

            {seller.offersLocalPickup && (
              <PolicyRow
                label="Pickup"
                value="Available"
              />
            )}
          </section>
        </div>

        <section
          id="reviews"
          style={{
            ...infoCardStyle,

            marginTop:
              "16px",
          }}
        >
          <SectionHeading
            title="Reviews"
            subtitle="HairGrab marketplace reviews. Shopping stays on HairGrab."
          />

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",

              gap:
                "12px",
            }}
          >
            <div
              style={
                reviewBoxStyle
              }
            >
              <div
                style={{
                  color:
                    "#4B1678",

                  fontWeight:
                    900,

                  fontSize:
                    "13px",
                }}
              >
                Seller Reviews
              </div>

              <div
                style={{
                  color:
                    "#756b79",

                  fontSize:
                    "11px",

                  lineHeight:
                    1.5,

                  marginTop:
                    "5px",
                }}
              >
                New on HairGrab. Seller reputation reviews will appear here after verified marketplace purchases.
              </div>
            </div>

            <div
              style={
                reviewBoxStyle
              }
            >
              <div
                style={{
                  color:
                    "#4B1678",

                  fontWeight:
                    900,

                  fontSize:
                    "13px",
                }}
              >
                Product Reviews
              </div>

              <div
                style={{
                  color:
                    "#756b79",

                  fontSize:
                    "11px",

                  lineHeight:
                    1.5,

                  marginTop:
                    "5px",
                }}
              >
                Products without HairGrab reviews display “New on HairGrab” instead of empty stars.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}


function ProductGrid({
  products,
}: {
  products: Array<{
    id: string;
    title: string;
    shopifyHandle: string;
    imageUrl: string | null;
    imageAlt: string;
    price: string;
    onSale: boolean;
    featured: boolean;
    isNew: boolean;
  }>;
}) {
  return (
    <div
      className="hg-product-grid"
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
        (
          product,
        ) => (
          <article
            key={
              product.id
            }
            className="hg-product-card"
            style={{
              background:
                "white",

              border:
                "1px solid #e5dce9",

              borderRadius:
                "13px",

              padding:
                "12px",

              boxShadow:
                "0 3px 12px rgba(45,27,54,.03)",
            }}
          >
            <div
              style={{
                position:
                  "relative",

                aspectRatio:
                  "1 / 1",

                borderRadius:
                  "10px",

                overflow:
                  "hidden",

                background:
                  "#f3edf7",

                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "center",
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
                      "10px",

                    fontWeight:
                      800,
                  }}
                >
                  No Image
                </div>
              )}

              {product.onSale && (
                <span
                  style={{
                    position:
                      "absolute",

                    top:
                      "8px",

                    left:
                      "8px",

                    background:
                      "#D4AF37",

                    color:
                      "#2b1b35",

                    borderRadius:
                      "999px",

                    padding:
                      "4px 7px",

                    fontSize:
                      "8px",

                    fontWeight:
                      900,
                  }}
                >
                  SALE
                </span>
              )}
            </div>

            <div
              className="hg-product-title"
              style={{
                marginTop:
                  "9px",

                fontWeight:
                  900,

                fontSize:
                  "13px",

                lineHeight:
                  1.3,
              }}
            >
              {product.title}
            </div>

            {product.price && (
              <div
                style={{
                  marginTop:
                    "5px",

                  color:
                    "#4B1678",

                  fontSize:
                    "12px",

                  fontWeight:
                    900,
                }}
              >
                {product.price}
              </div>
            )}

            <div
              style={{
                marginTop:
                  "7px",

                color:
                  "#8a7b91",

                fontSize:
                  "9px",

                fontWeight:
                  800,
              }}
            >
              New on HairGrab
            </div>

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
                    "10px",

                  fontWeight:
                    900,
                }}
              >
                View Product →
              </a>
            )}
          </article>
        ),
      )}
    </div>
  );
}


function CollectionCard({
  title,
  count,
  href,
}: {
  title: string;
  count: number;
  href: string;
}) {
  return (
    <a
      href={href}
      style={{
        background:
          "white",

        border:
          "1px solid #e5dce9",

        borderRadius:
          "13px",

        padding:
          "15px",

        textDecoration:
          "none",

        color:
          "#21152a",

        boxShadow:
          "0 3px 12px rgba(45,27,54,.03)",
      }}
    >
      <div
        style={{
          color:
            "#4B1678",

          fontSize:
            "14px",

          fontWeight:
            900,
        }}
      >
        {title}
      </div>

      <div
        style={{
          color:
            "#756b79",

          fontSize:
            "10px",

          marginTop:
            "5px",
        }}
      >
        {count}{" "}
        {count ===
        1
          ? "product"
          : "products"}
      </div>
    </a>
  );
}


function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        marginBottom:
          "12px",
      }}
    >
      <h2
        style={{
          margin:
            0,

          color:
            "#4B1678",

          fontSize:
            "21px",

          lineHeight:
            1.1,
        }}
      >
        {title}
      </h2>

      <div
        style={{
          color:
            "#756b79",

          fontSize:
            "10px",

          marginTop:
            "4px",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}


function PolicyRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display:
          "flex",

        justifyContent:
          "space-between",

        gap:
          "10px",

        padding:
          "9px 0",

        borderBottom:
          "1px solid #f0e9f3",

        fontSize:
          "10px",
      }}
    >
      <span
        style={{
          color:
            "#756b79",
        }}
      >
        {label}
      </span>

      <span
        style={{
          color:
            "#35263e",

          fontWeight:
            900,

          textAlign:
            "right",
        }}
      >
        {value}
      </span>
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

        border:
          "1px solid #e2d1ef",

        borderRadius:
          "999px",

        padding:
          "6px 8px",

        fontSize:
          "9px",

        fontWeight:
          900,
      }}
    >
      {children}
    </span>
  );
}


function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <div
      style={{
        background:
          "white",

        border:
          "1px solid #e5dce9",

        borderRadius:
          "13px",

        padding:
          "26px 18px",

        textAlign:
          "center",

        color:
          "#756b79",

        fontSize:
          "11px",
      }}
    >
      {text}
    </div>
  );
}




const infoCardStyle = {
  background:
    "white",

  border:
    "1px solid #e5dce9",

  borderRadius:
    "14px",

  padding:
    "18px",
};


const reviewBoxStyle = {
  background:
    "#F7F2FA",

  border:
    "1px solid #e2d1ef",

  borderRadius:
    "11px",

  padding:
    "13px",
};
