import type { LoaderFunctionArgs } from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import {
  useState,
} from "react";

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
      style:
        "currency",
      currency:
        "USD",
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

  if (
    prices.length ===
    0
  ) {
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
        id:
          true,

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
    shopifyIds.length ===
    0
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

  for (
    let index = 0;
    index <
    shopifyIds.length;
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
      json.errors.length >
        0
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

    for (
      const node of
      json.data?.nodes ||
      []
    ) {
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
          (product) =>
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
            coreId:
              core?.id ||
              "",

            shopifyId:
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
      .filter(
        (product) =>
          Boolean(
            product.coreId,
          ),
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

  const [
    viewMode,
    setViewMode,
  ] =
    useState<
      "tile" |
      "list"
    >(
      "tile",
    );

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
          ← Back to Dashboard
        </Link>

        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "end",
            gap:
              "14px",
            flexWrap:
              "wrap",
            margin:
              "10px 0 20px",
          }}
        >
          <div>
            <h1
              style={{
                margin:
                  "0 0 5px",
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
              display:
                "flex",
              gap:
                "8px",
              alignItems:
                "center",
              flexWrap:
                "wrap",
            }}
          >
            <div
              style={{
                color:
                  "#4B1678",
                fontWeight:
                  800,
                fontSize:
                  "12px",
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

            <button
              type="button"
              onClick={() =>
                setViewMode(
                  "tile",
                )
              }
              style={
                toggleStyle(
                  viewMode ===
                    "tile",
                )
              }
            >
              ▦ Tile
            </button>

            <button
              type="button"
              onClick={() =>
                setViewMode(
                  "list",
                )
              }
              style={
                toggleStyle(
                  viewMode ===
                    "list",
                )
              }
            >
              ☰ List
            </button>
          </div>
        </div>

        {products.length ===
        0 ? (
          <EmptyProducts />
        ) : viewMode ===
          "tile" ? (
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
                <ProductTile
                  key={
                    product.coreId
                  }
                  product={
                    product
                  }
                />
              ),
            )}
          </div>
        ) : (
          <div
            style={{
              display:
                "grid",
              gap:
                "10px",
            }}
          >
            {products.map(
              (product) => (
                <ProductRow
                  key={
                    product.coreId
                  }
                  product={
                    product
                  }
                />
              ),
            )}
          </div>
        )}
      </main>
    </div>
  );
}


function ProductTile({
  product,
}: {
  product: {
    coreId: string;
    title: string;
    handle: string;
    imageUrl: string | null;
    imageAlt: string;
    price: string;
    inventory: number;
    status: string;
  };
}) {
  return (
    <div
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
      <Link
        to={`/seller/edit-product/${product.coreId}`}
        style={{
          color:
            "inherit",
          textDecoration:
            "none",
          display:
            "block",
        }}
      >
        <div
          style={{
            aspectRatio:
              "1 / 1",
            background:
              "#f4eff7",
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
                height:
                  "100%",
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                color:
                  "#8c7c95",
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
              "14px 14px 9px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              gap:
                "8px",
              justifyContent:
                "space-between",
              alignItems:
                "start",
            }}
          >
            <div
              style={{
                fontWeight:
                  "800",
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
              fontWeight:
                "800",
              fontSize:
                "14px",
              marginTop:
                "10px",
            }}
          >
            {product.price}
          </div>

          <div
            style={{
              color:
                "#817686",
              fontSize:
                "11px",
              marginTop:
                "5px",
            }}
          >
            Inventory: {product.inventory}
          </div>

          <div
            style={{
              color:
                "#4B1678",
              fontWeight:
                "800",
              fontSize:
                "12px",
              marginTop:
                "12px",
            }}
          >
            Edit Product →
          </div>
        </div>
      </Link>

      <div
        style={{
          padding:
            "0 14px 14px",
        }}
      >
        {String(
          product.status,
        ).toUpperCase() ===
        "ACTIVE" ? (
          <a
            href={`https://hairgrab.com/products/${product.handle}`}
            target="_blank"
            rel="noreferrer"
            style={{
              color:
                "#6f6575",
              fontSize:
                "11px",
              fontWeight:
                "800",
              textDecoration:
                "none",
            }}
          >
            Store View ↗
          </a>
        ) : (
          <span
            title="Store View is available once this product is Active on the marketplace."
            style={{
              color:
                "#b7aec0",
              fontSize:
                "11px",
              fontWeight:
                "800",
            }}
          >
            Store View (not yet live)
          </span>
        )}
      </div>
    </div>
  );
}


function ProductRow({
  product,
}: {
  product: {
    coreId: string;
    title: string;
    handle: string;
    imageUrl: string | null;
    imageAlt: string;
    price: string;
    inventory: number;
    status: string;
  };
}) {
  return (
    <div
      style={{
        background:
          "white",
        border:
          "1px solid #e5dce9",
        borderRadius:
          "12px",
        padding:
          "10px",
        display:
          "grid",
        gridTemplateColumns:
          "70px minmax(160px, 1fr) minmax(90px, .45fr) minmax(80px, .35fr) auto",
        gap:
          "14px",
        alignItems:
          "center",
      }}
    >
      <div
        style={{
          width:
            "70px",
          height:
            "70px",
          borderRadius:
            "9px",
          overflow:
            "hidden",
          background:
            "#f4eff7",
        }}
      >
        {product.imageUrl && (
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
        )}
      </div>

      <div>
        <div
          style={{
            fontWeight:
              "800",
            fontSize:
              "13px",
          }}
        >
          {product.title}
        </div>

        <div
          style={{
            marginTop:
              "6px",
          }}
        >
          <StatusBadge
            status={
              product.status
            }
          />
        </div>
      </div>

      <div
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
      </div>

      <div
        style={{
          color:
            "#756b79",
          fontSize:
            "12px",
        }}
      >
        Inventory: {product.inventory}
      </div>

      <div
        style={{
          display:
            "flex",
          gap:
            "8px",
          flexWrap:
            "wrap",
        }}
      >
        <Link
          to={`/seller/edit-product/${product.coreId}`}
          style={
            primaryLink
          }
        >
          Edit
        </Link>

        {String(
          product.status,
        ).toUpperCase() ===
        "ACTIVE" ? (
          <a
            href={`https://hairgrab.com/products/${product.handle}`}
            target="_blank"
            rel="noreferrer"
            style={
              secondaryLink
            }
          >
            Store View
          </a>
        ) : (
          <span
            title="Store View is available once this product is Active on the marketplace."
            style={{
              ...secondaryLink,
              color:
                "#b7aec0",
              cursor:
                "default",
            }}
          >
            Store View
          </span>
        )}
      </div>
    </div>
  );
}


function EmptyProducts() {
  return (
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

      <Link
        to="/seller/add-product"
        style={{
          ...primaryLink,
          display:
            "inline-block",
          marginTop:
            "16px",
        }}
      >
        + Add Product
      </Link>
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
      status ||
      "DRAFT",
    ).toUpperCase();

  const active =
    normalized ===
    "ACTIVE";

  return (
    <span
      style={{
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


function toggleStyle(
  active: boolean,
) {
  return {
    border:
      "1px solid #d8c8e2",
    borderRadius:
      "8px",
    padding:
      "8px 11px",
    background:
      active
        ? "#4B1678"
        : "white",
    color:
      active
        ? "white"
        : "#4B1678",
    fontWeight:
      "800",
    fontSize:
      "11px",
    cursor:
      "pointer",
  };
}


const primaryLink = {
  background:
    "#4B1678",
  color:
    "white",
  borderRadius:
    "8px",
  padding:
    "8px 11px",
  textDecoration:
    "none",
  fontSize:
    "11px",
  fontWeight:
    "800",
};

const secondaryLink = {
  border:
    "1px solid #d8c8e2",
  color:
    "#4B1678",
  borderRadius:
    "8px",
  padding:
    "7px 10px",
  textDecoration:
    "none",
  fontSize:
    "11px",
  fontWeight:
    "800",
};
