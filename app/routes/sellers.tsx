import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import db from "../db.server";


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


export const loader = async ({
  request: _request,
}: LoaderFunctionArgs) => {
  const sellers =
    await db.seller.findMany({
      where: {
        status:
          "ACTIVE",
      },

      select: {
        id:
          true,

        businessName:
          true,

        storeSlug:
          true,

        storeDescription:
          true,

        logoUrl:
          true,

        bannerUrl:
          true,

        sellsNationwide:
          true,

        offersLocalPickup:
          true,

        offersLocalDelivery:
          true,

        products: {
          where: {
            status:
              "ACTIVE",
          },

          select: {
            id:
              true,
          },
        },
      },

      orderBy: {
        businessName:
          "asc",
      },
    });

  return {
    sellers:
      sellers.map(
        (seller) => ({
          id:
            seller.id,

          businessName:
            seller.businessName,

          storeSlug:
            seller.storeSlug ||
            slugify(
              seller.businessName,
            ),

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

          productCount:
            seller.products.length,
        }),
      ),
  };
};


export default function PublicSellerDirectoryPage() {
  const {
    sellers,
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
          "#faf8fc",

        fontFamily:
          "Arial, Helvetica, sans-serif",

        color:
          "#21152a",
      }}
    >
      <header
        style={{
          background:
            "#ffffff",

          borderBottom:
            "1px solid #eee6f2",

          padding:
            "16px 18px",
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
          <div>
            <div
              style={{
                color:
                  "#4B1678",

                fontSize:
                  "11px",

                fontWeight:
                  "800",

                letterSpacing:
                  ".8px",
              }}
            >
              HAIRGRAB
            </div>

            <div
              style={{
                color:
                  "#4B1678",

                fontSize:
                  "24px",

                fontWeight:
                  "800",

                marginTop:
                  "2px",
              }}
            >
              Seller Storefronts
            </div>
          </div>

          <a
            href="https://hairgrab.com"
            style={{
              color:
                "#4B1678",

              textDecoration:
                "none",

              fontSize:
                "12px",

              fontWeight:
                "800",
            }}
          >
            Back to HairGrab
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
            "34px 18px 60px",
        }}
      >
        <div
          style={{
            maxWidth:
              "720px",

            marginBottom:
              "24px",
          }}
        >
          <h1
            style={{
              margin:
                0,

              color:
                "#4B1678",

              fontSize:
                "30px",
            }}
          >
            Shop by Seller
          </h1>

          <p
            style={{
              margin:
                "8px 0 0",

              color:
                "#756b79",

              fontSize:
                "13px",

              lineHeight:
                1.6,
            }}
          >
            Discover independent hair brands on HairGrab and shop their products without leaving the marketplace.
          </p>
        </div>

        {sellers.length ===
        0 ? (
          <div
            style={{
              background:
                "#ffffff",

              border:
                "1px solid #e5dce9",

              borderRadius:
                "14px",

              padding:
                "40px 20px",

              textAlign:
                "center",

              color:
                "#756b79",

              fontSize:
                "13px",
            }}
          >
            Seller storefronts will appear here as they go live.
          </div>
        ) : (
          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(260px, 1fr))",

              gap:
                "16px",
            }}
          >
            {sellers.map(
              (seller) => (
                <Link
                  key={
                    seller.id
                  }
                  to={`https://shops.hairgrab.com/seller-store/${seller.storeSlug}`}
                  style={{
                    color:
                      "inherit",

                    textDecoration:
                      "none",
                  }}
                >
                  <article
                    style={{
                      background:
                        "#ffffff",

                      border:
                        "1px solid #e5dce9",

                      borderRadius:
                        "14px",

                      overflow:
                        "hidden",

                      minHeight:
                        "100%",
                    }}
                  >
                    <div
                      style={{
                        height:
                          "120px",

                        background:
                          seller.bannerUrl
                            ? "#f3edf7"
                            : "linear-gradient(135deg, #f5edf9, #eee3f5)",

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
                              "#8a7b91",

                            fontSize:
                              "12px",

                            fontWeight:
                              "700",
                          }}
                        >
                          HairGrab Seller
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        padding:
                          "16px",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "grid",

                          gridTemplateColumns:
                            "62px minmax(0, 1fr)",

                          gap:
                            "12px",

                          alignItems:
                            "center",
                        }}
                      >
                        <div
                          style={{
                            width:
                              "62px",

                            height:
                              "62px",

                            borderRadius:
                              "12px",

                            border:
                              "1px solid #e4d6eb",

                            background:
                              "#ffffff",

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
                                  "10px",

                                textAlign:
                                  "center",

                                padding:
                                  "6px",
                              }}
                            >
                              Logo
                            </div>
                          )}
                        </div>

                        <div>
                          <div
                            style={{
                              color:
                                "#4B1678",

                              fontSize:
                                "17px",

                              fontWeight:
                                "800",

                              lineHeight:
                                1.25,
                            }}
                          >
                            {seller.businessName}
                          </div>

                          <div
                            style={{
                              color:
                                "#756b79",

                              fontSize:
                                "11px",

                              marginTop:
                                "4px",
                            }}
                          >
                            {seller.productCount} {seller.productCount === 1 ? "product" : "products"}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          color:
                            "#4f4554",

                          fontSize:
                            "12px",

                          lineHeight:
                            1.55,

                          marginTop:
                            "14px",

                          minHeight:
                            "56px",

                          display:
                            "-webkit-box",

                          WebkitLineClamp:
                            3,

                          WebkitBoxOrient:
                            "vertical",

                          overflow:
                            "hidden",
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
                            "7px",

                          flexWrap:
                            "wrap",

                          marginTop:
                            "14px",
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
                          marginTop:
                            "16px",

                          color:
                            "#4B1678",

                          fontSize:
                            "12px",

                          fontWeight:
                            "800",
                        }}
                      >
                        View Store →
                      </div>
                    </div>
                  </article>
                </Link>
              ),
            )}
          </div>
        )}
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
          "5px 8px",

        fontSize:
          "9px",

        fontWeight:
          "800",
      }}
    >
      {children}
    </span>
  );
}
