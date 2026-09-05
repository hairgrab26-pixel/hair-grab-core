import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { requireSellerSession } from "../seller-session.server";


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  const products =
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

      website:
        seller.website ||
        "",

      instagram:
        seller.instagram ||
        "",

      tiktok:
        seller.tiktok ||
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

  const location =
    [
      seller.city,
      seller.state,
    ]
      .filter(Boolean)
      .join(", ");

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
              <div
                style={{
                  color:
                    "#4B1678",

                  fontSize:
                    "11px",

                  fontWeight:
                    "800",
                }}
              >
                {seller.sellerCode}
              </div>

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

              {location && (
                <div
                  style={{
                    color:
                      "#756b79",

                    fontSize:
                      "12px",

                    marginBottom:
                      "10px",
                  }}
                >
                  {location}
                </div>
              )}

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

              <div
                style={{
                  display:
                    "flex",

                  gap:
                    "12px",

                  flexWrap:
                    "wrap",

                  marginTop:
                    "16px",
                }}
              >
                {seller.website && (
                  <ExternalLink
                    href={
                      seller.website
                    }
                  >
                    Website
                  </ExternalLink>
                )}

                {seller.instagram && (
                  <ExternalLink
                    href={
                      normalizeSocialUrl(
                        seller.instagram,
                        "instagram",
                      )
                    }
                  >
                    Instagram
                  </ExternalLink>
                )}

                {seller.tiktok && (
                  <ExternalLink
                    href={
                      normalizeSocialUrl(
                        seller.tiktok,
                        "tiktok",
                      )
                    }
                  >
                    TikTok
                  </ExternalLink>
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
                      Product image
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


function ExternalLink({
  href,
  children,
}: {
  href: string;
  children:
    React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
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
      {children} ↗
    </a>
  );
}


function normalizeSocialUrl(
  value: string,
  platform:
    | "instagram"
    | "tiktok",
) {
  const trimmed =
    value.trim();

  if (
    /^https?:\/\//i.test(
      trimmed,
    )
  ) {
    return trimmed;
  }

  const username =
    trimmed.replace(
      /^@/,
      "",
    );

  return platform ===
    "instagram"
    ? `https://instagram.com/${username}`
    : `https://tiktok.com/@${username}`;
}
