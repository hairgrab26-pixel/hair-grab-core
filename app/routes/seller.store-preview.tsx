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
  vendor: string;
  imageUrl: string | null;
  imageAlt: string;
  price: string;
  onSale: boolean;
  shippingScope: string;
  shipsWithin: string;
  shipsFromCity: string;
  shipsFromState: string;
  returnPolicy: string;
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
    storeCollections,
    storeMedia,
    storeHours,
    sellerReviews,
    productReviews,
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

      db.sellerStoreCollection.findMany({
        where: {
          sellerId: seller.id,
          isVisible: true,
        },
        orderBy: { rank: "asc" },
        include: {
          products: {
            orderBy: { rank: "asc" },
            select: { sellerProductId: true },
          },
        },
      }),

      db.sellerStoreMedia.findMany({
        where: {
          sellerId: seller.id,
          isVisible: true,
        },
        orderBy: { rank: "asc" },
      }),

      db.sellerStoreHour.findMany({
        where: { sellerId: seller.id },
        orderBy: { dayOfWeek: "asc" },
      }),

      db.sellerReview.findMany({
        where: {
          sellerId: seller.id,
          status: "PUBLISHED",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),

      db.productReview.findMany({
        where: {
          sellerProduct: { sellerId: seller.id },
          status: "PUBLISHED",
        },
        select: {
          sellerProductId: true,
          rating: true,
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
                  vendor

                  metafields(first: 50, namespace: "custom") {
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

          const metafields = new Map<string, string>(
            (node?.metafields?.nodes || []).map(
              (metafield: any) => [
                String(metafield?.key || "").toLowerCase(),
                String(metafield?.value || ""),
              ],
            ),
          );

          const metafieldValue = (...keys: string[]) => {
            for (const key of keys) {
              const value = metafields.get(key.toLowerCase());
              if (value) {
                return value;
              }
            }
            return "";
          };

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

              vendor:
                String(
                  node.vendor ||
                  "",
                ),

              shippingScope:
                metafieldValue(
                  "shipping_scope",
                  "shipping_territory",
                ),

              shipsWithin:
                metafieldValue(
                  "ships_within",
                  "ships_within_24_hours",
                ),

              shipsFromCity:
                metafieldValue(
                  "ships_from_city",
                ),

              shipsFromState:
                metafieldValue(
                  "ships_from_state",
                ),

              returnPolicy:
                metafieldValue(
                  "return_policy",
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

          vendor:
            shopifyProduct
              ?.vendor ||
            seller.businessName,

          shippingScope:
            shopifyProduct
              ?.shippingScope ||
            (seller.sellsNationwide
              ? "Nationwide"
              : ""),

          shipsWithin:
            shopifyProduct
              ?.shipsWithin ||
            "",

          shipsFromCity:
            shopifyProduct
              ?.shipsFromCity ||
            seller.city ||
            "",

          shipsFromState:
            shopifyProduct
              ?.shipsFromState ||
            seller.state ||
            "",

          productReturnPolicy:
            shopifyProduct
              ?.returnPolicy ||
            seller.returnPolicy ||
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

  const productReviewStats = new Map<
    string,
    { count: number; total: number }
  >();

  for (const review of productReviews) {
    const current = productReviewStats.get(review.sellerProductId) || {
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total += review.rating;
    productReviewStats.set(review.sellerProductId, current);
  }

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

      showFeaturedCollection:
        seller.showFeaturedCollection,
      showNewArrivalsCollection:
        seller.showNewArrivalsCollection,
      showOnSaleCollection:
        seller.showOnSaleCollection,
      showCustomCollections:
        seller.showCustomCollections,
      showGallery:
        seller.showGallery,
      showReviews:
        seller.showReviews,
      storeOpenOverride:
        seller.storeOpenOverride || "AUTO",
    },

    products:
      products.map(
        (
          product,
        ) => {
          const stats = productReviewStats.get(product.id);
          return {
            ...product,

            isNew:
              new Date(
                product.createdAt,
              ).getTime() >=
              newArrivalCutoff,

            reviewCount: stats?.count || 0,
            reviewAverage:
              stats && stats.count > 0
                ? stats.total / stats.count
                : null,
          };
        },
      ),

    customCollections: storeCollections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      imageUrl: collection.imageUrl || "",
      productIds: collection.products.map((item) => item.sellerProductId),
    })),

    storeMedia: storeMedia.map((media) => ({
      id: media.id,
      mediaType: media.mediaType,
      url: media.url,
      altText: media.altText || "",
    })),

    storeHours: storeHours.map((hour) => ({
      dayOfWeek: hour.dayOfWeek,
      isClosed: hour.isClosed,
      openTime: hour.openTime || "",
      closeTime: hour.closeTime || "",
    })),

    sellerReviews: sellerReviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      title: review.title || "",
      body: review.body || "",
      verifiedPurchase: review.verifiedPurchase,
      createdAt: review.createdAt.toISOString(),
    })),
  };
};


export default function SellerStorePreviewPage() {
  const {
    seller,
    products,
    customCollections,
    storeMedia,
    storeHours,
    sellerReviews,
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

  const visibleCustomCollections =
    seller.showCustomCollections
      ? customCollections
      : [];

  const collectionProductMap =
    new Map(
      visibleCustomCollections.map(
        (collection) => [
          collection.id,
          products.filter((product) =>
            collection.productIds.includes(product.id),
          ),
        ],
      ),
    );

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const storeStatusLabel =
    seller.storeOpenOverride === "OPEN"
      ? "Open"
      : seller.storeOpenOverride === "CLOSED"
        ? "Closed"
        : storeHours.length > 0
          ? "Hours Listed"
          : "";

  const sellerReviewAverage =
    sellerReviews.length > 0
      ? sellerReviews.reduce(
          (sum, review) => sum + review.rating,
          0,
        ) / sellerReviews.length
      : null;

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
            grid-template-columns: 68px minmax(0, 1fr) !important;
            gap: 12px !important;
            padding: 15px !important;
          }

          .hg-preview-logo {
            width: 68px !important;
            height: 68px !important;
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

              {storeStatusLabel && (
                <div
                  style={{
                    color:
                      seller.storeOpenOverride === "CLOSED"
                        ? "#8a4d4d"
                        : "#4B1678",
                    fontSize: "10px",
                    fontWeight: 900,
                    marginBottom: "8px",
                  }}
                >
                  {storeStatusLabel}
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
          id="collections"
          style={{
            marginTop:
              "30px",
          }}
        >
          <SectionHeading
            title="Collections"
            subtitle="Browse this HairGrab store."
          />

          <div
            style={{
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              paddingBottom: "8px",
              marginBottom: "12px",
            }}
          >
            <CollectionChip title="All Products" href="#shop" />
            {seller.showFeaturedCollection && (
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

            {featured.length > 0 ? (
              <ProductGrid products={featured} />
            ) : (
              <EmptyState text="Seller Picks will appear here." />
            )}
          </section>
        )}

        {seller.showNewArrivalsCollection && newArrivals.length > 0 && (
              <CollectionChip title="New Arrivals" href="#new-arrivals" />
            )}
            {seller.showOnSaleCollection && onSale.length > 0 && (
              <CollectionChip title="On Sale" href="#on-sale" />
            )}
            {seller.showFeaturedCollection && featured.length > 0 && (
              <CollectionChip title="Featured" href="#home" />
            )}
            {visibleCustomCollections.map((collection) => (
              <CollectionChip
                key={collection.id}
                title={collection.name}
                href={`#collection-${collection.slug}`}
              />
            ))}
          </div>

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
              count={products.length}
              href="#shop"
            />

            {seller.showNewArrivalsCollection && (
              <CollectionCard
                title="New Arrivals"
                count={newArrivals.length}
                href="#new-arrivals"
              />
            )}

            {seller.showOnSaleCollection && (
              <CollectionCard
                title="On Sale"
                count={onSale.length}
                href="#on-sale"
              />
            )}

            {seller.showFeaturedCollection && (
              <CollectionCard
                title="Featured"
                count={featured.length}
                href="#home"
              />
            )}

            {visibleCustomCollections.map((collection) => (
              <CollectionCard
                key={collection.id}
                title={collection.name}
                count={(collectionProductMap.get(collection.id) || []).length}
                href={`#collection-${collection.slug}`}
                imageUrl={collection.imageUrl}
              />
            ))}
          </div>
        </section>

        {seller.showNewArrivalsCollection &&
          newArrivals.length > 0 && (
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

        {seller.showOnSaleCollection &&
          onSale.length > 0 && (
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

        {visibleCustomCollections.map((collection) => {
          const collectionProducts =
            collectionProductMap.get(collection.id) || [];

          return (
            <section
              key={collection.id}
              id={`collection-${collection.slug}`}
              style={{ marginTop: "30px" }}
            >
              <SectionHeading
                title={collection.name}
                subtitle={`${collectionProducts.length} ${
                  collectionProducts.length === 1 ? "product" : "products"
                }`}
              />

              {collectionProducts.length > 0 ? (
                <ProductGrid products={collectionProducts} />
              ) : (
                <EmptyState text="Products will appear here when this collection is stocked." />
              )}
            </section>
          );
        })}

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

        {seller.showGallery && storeMedia.length > 0 && (
          <section
            id="gallery"
            style={{
              ...infoCardStyle,
              marginTop: "16px",
            }}
          >
            <SectionHeading
              title="Gallery"
              subtitle={`Inside ${seller.businessName}.`}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
              }}
            >
              {storeMedia.map((media) => (
                <div
                  key={media.id}
                  style={{
                    borderRadius: "12px",
                    overflow: "hidden",
                    background: "#f3edf7",
                    border: "1px solid #e5dce9",
                  }}
                >
                  {media.mediaType === "VIDEO" ? (
                    <video
                      src={media.url}
                      controls
                      playsInline
                      style={{
                        width: "100%",
                        display: "block",
                        maxHeight: "420px",
                      }}
                    />
                  ) : (
                    <a
                      href={media.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "block" }}
                    >
                      <img
                        src={media.url}
                        alt={media.altText || `${seller.businessName} gallery image`}
                        style={{
                          width: "100%",
                          aspectRatio: "1 / 1",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {storeHours.length > 0 && (
          <section
            id="hours"
            style={{
              ...infoCardStyle,
              marginTop: "16px",
            }}
          >
            <SectionHeading
              title="Store Hours"
              subtitle="Local pickup and delivery availability."
            />

            {storeHours.map((hour) => (
              <PolicyRow
                key={hour.dayOfWeek}
                label={dayNames[hour.dayOfWeek] || `Day ${hour.dayOfWeek}`}
                value={
                  hour.isClosed
                    ? "Closed"
                    : hour.openTime && hour.closeTime
                      ? `${hour.openTime} – ${hour.closeTime}`
                      : "Hours not set"
                }
              />
            ))}
          </section>
        )}

        {seller.showReviews && (
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

          {sellerReviews.length > 0 ? (
            <div>
              <div style={reviewBoxStyle}>
                <div
                  style={{
                    color: "#4B1678",
                    fontWeight: 900,
                    fontSize: "14px",
                  }}
                >
                  {sellerReviewAverage?.toFixed(1)} ★ · {sellerReviews.length}{" "}
                  {sellerReviews.length === 1 ? "review" : "reviews"}
                </div>
                <div
                  style={{
                    color: "#756b79",
                    fontSize: "10px",
                    marginTop: "4px",
                  }}
                >
                  HairGrab marketplace seller reviews.
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                  marginTop: "12px",
                }}
              >
                {sellerReviews.map((review) => (
                  <div key={review.id} style={reviewBoxStyle}>
                    <div
                      style={{
                        color: "#D4AF37",
                        fontWeight: 900,
                        fontSize: "12px",
                      }}
                    >
                      {"★".repeat(Math.max(1, Math.min(5, review.rating)))}
                    </div>

                    {review.title && (
                      <div
                        style={{
                          color: "#4B1678",
                          fontWeight: 900,
                          fontSize: "12px",
                          marginTop: "6px",
                        }}
                      >
                        {review.title}
                      </div>
                    )}

                    {review.body && (
                      <div
                        style={{
                          color: "#4f4554",
                          fontSize: "11px",
                          lineHeight: 1.5,
                          marginTop: "5px",
                        }}
                      >
                        {review.body}
                      </div>
                    )}

                    {review.verifiedPurchase && (
                      <div
                        style={{
                          color: "#4B1678",
                          fontSize: "9px",
                          fontWeight: 900,
                          marginTop: "7px",
                        }}
                      >
                        Verified Purchase
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={reviewBoxStyle}>
              <div
                style={{
                  color: "#4B1678",
                  fontWeight: 900,
                  fontSize: "13px",
                }}
              >
                New on HairGrab
              </div>
              <div
                style={{
                  color: "#756b79",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  marginTop: "5px",
                }}
              >
                Seller reviews will appear here after verified HairGrab purchases.
              </div>
            </div>
          )}
        </section>
        )}
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
    vendor: string;
    shippingScope: string;
    shipsWithin: string;
    shipsFromCity: string;
    shipsFromState: string;
    productReturnPolicy: string;
    onSale: boolean;
    featured: boolean;
    isNew: boolean;
    reviewCount: number;
    reviewAverage: number | null;
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

            <div
              style={{
                marginTop: "4px",
                color: "#6f6575",
                fontSize: "9px",
                fontWeight: 800,
              }}
            >
              {product.vendor}
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
                  product.reviewCount > 0
                    ? "#4B1678"
                    : "#8a7b91",

                fontSize:
                  "9px",

                fontWeight:
                  800,
              }}
            >
              {product.reviewCount > 0 && product.reviewAverage !== null
                ? `${product.reviewAverage.toFixed(1)} ★ · ${product.reviewCount} ${
                    product.reviewCount === 1 ? "review" : "reviews"
                  }`
                : "New on HairGrab"}
            </div>

            <div
              style={{
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid #f0e9f3",
                display: "grid",
                gap: "4px",
                color: "#5f5564",
                fontSize: "9px",
                lineHeight: 1.35,
              }}
            >
              {product.shippingScope && (
                <div>
                  <strong style={{ color: "#4B1678" }}>
                    {product.shippingScope.toLowerCase().includes("nation")
                      ? "Ships Nationwide"
                      : product.shippingScope}
                  </strong>
                </div>
              )}

              {product.shipsWithin && (
                <div>
                  Ships Within <strong>{product.shipsWithin}</strong>
                </div>
              )}

              {(product.shipsFromCity || product.shipsFromState) && (
                <div>
                  Ships From{" "}
                  <strong>
                    {[product.shipsFromCity, product.shipsFromState]
                      .filter(Boolean)
                      .join(", ")}
                  </strong>
                </div>
              )}

              {product.productReturnPolicy && (
                <div>
                  {product.productReturnPolicy === "14_DAY_RETURNS"
                    ? "14-Day Returns"
                    : product.productReturnPolicy === "FINAL_SALE"
                      ? "Final Sale"
                      : product.productReturnPolicy}
                </div>
              )}
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
  imageUrl,
}: {
  title: string;
  count: number;
  href: string;
  imageUrl?: string;
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
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`${title} collection`}
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            objectFit: "cover",
            borderRadius: "9px",
            marginBottom: "10px",
            display: "block",
          }}
        />
      )}

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


function CollectionChip({
  title,
  href,
}: {
  title: string;
  href: string;
}) {
  return (
    <a
      href={href}
      style={{
        flex: "0 0 auto",
        background: "white",
        color: "#4B1678",
        border: "1px solid #e2d1ef",
        borderRadius: "999px",
        padding: "8px 11px",
        textDecoration: "none",
        fontSize: "10px",
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {title}
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
