import type { LoaderFunctionArgs } from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { requireSellerSession } from "../seller-session.server";


type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;

  featuredImage?: {
    url?: string | null;
    altText?: string | null;
  } | null;

  variants?: {
    nodes?: Array<{
      price?: string | null;
      inventoryQuantity?: number | null;
    }>;
  } | null;
};


type ShopifyNodesResponse = {
  data?: {
    nodes?: Array<
      ShopifyProductNode |
      null
    >;
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


function formatMoney(
  amount: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    },
  ).format(amount);
}


function getPriceLabel(
  variants:
    ShopifyProductNode["variants"],
) {
  const prices =
    (variants?.nodes || [])
      .map(
        (variant) =>
          Number(
            variant.price || 0,
          ),
      )
      .filter(
        (price) =>
          Number.isFinite(price) &&
          price >= 0,
      );

  if (prices.length === 0) {
    return "—";
  }

  const min =
    Math.min(...prices);

  const max =
    Math.max(...prices);

  if (min === max) {
    return formatMoney(min);
  }

  return `From ${formatMoney(min)}`;
}


function getInventory(
  variants:
    ShopifyProductNode["variants"],
) {
  return (variants?.nodes || [])
    .reduce(
      (
        total,
        variant,
      ) =>
        total +
        Number(
          variant.inventoryQuantity ||
          0,
        ),
      0,
    );
}


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
      },

      select: {
        shopifyProductId:
          true,

        title:
          true,

        status:
          true,
      },

      orderBy: {
        updatedAt:
          "desc",
      },
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


  if (
    shopifyIds.length === 0
  ) {
    return {
      seller: {
        businessName:
          seller.businessName,

        sellerCode:
          seller.sellerCode,
      },

      products: [],
    };
  }


  const { admin } =
    await getShopifyAdmin();


  const shopifyProducts:
    ShopifyProductNode[] = [];


  // Keep the query small and predictable as HairGrab grows.
  for (
    let index = 0;
    index < shopifyIds.length;
    index += 50
  ) {

    const ids =
      shopifyIds.slice(
        index,
        index + 50,
      );


    const response =
      await admin.graphql(
        `#graphql
        query HairGrabSellerProductGrid(
          $ids: [ID!]!
        ) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              handle
              status

              featuredImage {
                url
                altText
              }

              variants(first: 100) {
                nodes {
                  price
                  inventoryQuantity
                }
              }
            }
          }
        }
        `,
        {
          variables: {
            ids,
          },
        },
      );


    const json =
      (await response.json()) as
        ShopifyNodesResponse;


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


    const nodes =
      json.data?.nodes || [];


    for (const node of nodes) {
      if (node?.id) {
        shopifyProducts.push(
          node,
        );
      }
    }
  }


  const coreByShopifyId =
    new Map(
      ownedProducts
        .filter(
          (
            product,
          ) =>
            Boolean(
              product.shopifyProductId,
            ),
        )
        .map(
          (product) => [
            String(
              product.shopifyProductId,
            ),
            product,
          ],
        ),
    );


  const products =
    shopifyProducts
      .map(
        (product) => {

          const core =
            coreByShopifyId.get(
              product.id,
            );


          return {
            id:
              product.id,

            title:
              product.title ||
              core?.title ||
              "Untitled Product",

            handle:
              product.handle,

            imageUrl:
              product.featuredImage
                ?.url ||
              null,

            imageAlt:
              product.featuredImage
                ?.altText ||
              product.title ||
              "HairGrab product",

            price:
              getPriceLabel(
                product.variants,
              ),

            inventory:
              getInventory(
                product.variants,
              ),

            status:
              product.status ||
              core?.status ||
              "DRAFT",
          };
        },
      )
      .sort(
        (a, b) =>
          a.title.localeCompare(
            b.title,
          ),
      );


  return {
    seller: {
      businessName:
        seller.businessName,

      sellerCode:
        seller.sellerCode,
    },

    products,
  };
};


export default function SellerProductsPage() {

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
          "#faf8fc",

        color:
          "#21152a",

        fontFamily:
          "Arial, Helvetica, sans-serif",
      }}
    >

      <header
        style={{
          background:
            "#4B1678",

          color:
            "white",

          padding:
            "18px 22px",
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

            alignItems:
              "center",

            justifyContent:
              "space-between",

            gap:
              "14px",

            flexWrap:
              "wrap",
          }}
        >

          <div>
            <div
              style={{
                fontSize:
                  "11px",

                fontWeight:
                  800,

                letterSpacing:
                  "1px",

                opacity:
                  0.8,
              }}
            >
              HAIRGRAB SELLER
            </div>

            <div
              style={{
                fontSize:
                  "23px",

                fontWeight:
                  800,

                marginTop:
                  "3px",
              }}
            >
              Products
            </div>
          </div>


          <Link
            to="/seller/add-product"
            style={{
              background:
                "white",

              color:
                "#4B1678",

              textDecoration:
                "none",

              fontWeight:
                800,

              fontSize:
                "13px",

              padding:
                "11px 16px",

              borderRadius:
                "8px",
            }}
          >
            + Add Product
          </Link>

        </div>
      </header>


      <main
        style={{
          maxWidth:
            "1180px",

          margin:
            "0 auto",

          padding:
            "26px 20px 60px",
        }}
      >

        <div
          style={{
            display:
              "flex",

            alignItems:
              "flex-end",

            justifyContent:
              "space-between",

            gap:
              "14px",

            flexWrap:
              "wrap",

            marginBottom:
              "20px",
          }}
        >

          <div>
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
              ← Dashboard
            </Link>


            <h1
              style={{
                margin:
                  "9px 0 5px",

                color:
                  "#4B1678",

                fontSize:
                  "28px",
              }}
            >
              Your Products
            </h1>


            <div
              style={{
                color:
                  "#756b79",

                fontSize:
                  "13px",
              }}
            >
              {seller.businessName} · {seller.sellerCode}
            </div>
          </div>


          <div
            style={{
              color:
                "#4B1678",

              fontWeight:
                800,

              fontSize:
                "13px",

              background:
                "#f2eafa",

              border:
                "1px solid #e2d1ef",

              borderRadius:
                "20px",

              padding:
                "8px 12px",
            }}
          >
            {products.length} {products.length === 1 ? "Product" : "Products"}
          </div>

        </div>


        {products.length === 0 ? (

          <div
            style={{
              background:
                "white",

              border:
                "1px solid #e5dce9",

              borderRadius:
                "14px",

              padding:
                "42px 20px",

              textAlign:
                "center",
            }}
          >
            <div
              style={{
                color:
                  "#4B1678",

                fontSize:
                  "18px",

                fontWeight:
                  800,
              }}
            >
              No products yet
            </div>

            <div
              style={{
                marginTop:
                  "7px",

                color:
                  "#817686",

                fontSize:
                  "13px",
              }}
            >
              Add your first product to start selling on HairGrab.
            </div>

            <Link
              to="/seller/add-product"
              style={{
                display:
                  "inline-block",

                marginTop:
                  "17px",

                background:
                  "#4B1678",

                color:
                  "white",

                textDecoration:
                  "none",

                fontWeight:
                  800,

                fontSize:
                  "13px",

                padding:
                  "11px 16px",

                borderRadius:
                  "8px",
              }}
            >
              + Add Product
            </Link>
          </div>

        ) : (

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fill, minmax(210px, 1fr))",

              gap:
                "16px",
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
                      "1px solid #e5dce9",

                    borderRadius:
                      "14px",

                    overflow:
                      "hidden",
                  }}
                >

                  <div
                    style={{
                      aspectRatio:
                        "1 / 1",

                      background:
                        "#f4eff7",

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
                            "#8c7c95",

                          fontWeight:
                            700,

                          fontSize:
                            "12px",
                        }}
                      >
                        No Image
                      </div>

                    )}

                  </div>


                  <div
                    style={{
                      padding:
                        "15px",
                    }}
                  >

                    <div
                      style={{
                        display:
                          "flex",

                        alignItems:
                          "flex-start",

                        justifyContent:
                          "space-between",

                        gap:
                          "8px",
                      }}
                    >

                      <div
                        style={{
                          color:
                            "#2a1b31",

                          fontWeight:
                            800,

                          fontSize:
                            "14px",

                          lineHeight:
                            1.35,
                        }}
                      >
                        {product.title}
                      </div>


                      <StatusBadge
                        status={
                          product.status
                        }
                      />

                    </div>


                    <div
                      style={{
                        color:
                          "#4B1678",

                        fontSize:
                          "15px",

                        fontWeight:
                          800,

                        marginTop:
                          "11px",
                      }}
                    >
                      {product.price}
                    </div>


                    <div
                      style={{
                        color:
                          "#817686",

                        fontSize:
                          "12px",

                        marginTop:
                          "5px",
                      }}
                    >
                      Inventory: {product.inventory}
                    </div>


                    <a
                     href={
  `https://hairgrab.com/products/${product.handle}`
}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display:
                          "inline-block",

                        marginTop:
                          "14px",

                        color:
                          "#4B1678",

                        textDecoration:
                          "none",

                        fontSize:
                          "12px",

                        fontWeight:
                          800,
                      }}
                    >
                      View Product →
                    </a>

                  </div>

                </div>

              ),
            )}

          </div>

        )}

      </main>
    </div>
  );
}


function StatusBadge({
  status,
}: {
  status: string;
}) {

  const normalized =
    String(
      status || "DRAFT",
    ).toUpperCase();


  const active =
    normalized ===
    "ACTIVE";


  return (
    <span
      style={{
        flexShrink:
          0,

        borderRadius:
          "20px",

        padding:
          "4px 7px",

        fontSize:
          "9px",

        fontWeight:
          800,

        background:
          active
            ? "#edf8ef"
            : "#f3edf7",

        color:
          active
            ? "#28743b"
            : "#6d447e",
      }}
    >
      {normalized}
    </span>
  );
}
