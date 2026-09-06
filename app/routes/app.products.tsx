import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useFetcher,
  useLoaderData,
} from "react-router";

import {
  useMemo,
  useState,
} from "react";

import {
  authenticate,
} from "../shopify.server";

import db from "../db.server";


// ==========================================================
// TYPES
// ==========================================================

type ShopifyProductInfo = {
  id: string;
  title: string;
  handle: string;
  status: string;
};


// ==========================================================
// HELPERS
// ==========================================================

function formatStatus(
  value: string,
) {
  return String(
    value || "",
  )
    .replace(
      /_/g,
      " ",
    )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}


function formatDate(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ).format(
    new Date(value),
  );
}


// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const {
    admin,
  } =
    await authenticate.admin(
      request,
    );


  const coreProducts =
    await db.sellerProduct.findMany({
      include: {
        seller: {
          select: {
            id:
              true,

            sellerCode:
              true,

            businessName:
              true,

            shopifyVendor:
              true,

            status:
              true,
          },
        },
      },

      orderBy: {
        updatedAt:
          "desc",
      },
    });


  const shopifyIds =
    coreProducts
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
      ShopifyProductInfo
    >();


  if (
    shopifyIds.length >
    0
  ) {
    const response =
      await admin.graphql(
        `#graphql
        query HairGrabAdminProducts(
          $ids: [ID!]!
        ) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              handle
              status
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
      json?.errors?.length
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
              "Unable to load Shopify products.",
          )
          .join(
            " | ",
          ),
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

      shopifyById.set(
        String(
          node.id,
        ),
        {
          id:
            String(
              node.id,
            ),

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

          status:
            String(
              node.status ||
              "UNKNOWN",
            ),
        },
      );
    }
  }


  const products =
    coreProducts.map(
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

          coreStatus:
            product.status,

          shopifyStatus:
            shopifyProduct
              ?.status ||
            "MISSING",

          shopifyProductId:
            product.shopifyProductId,

          shopifyHandle:
            shopifyProduct
              ?.handle ||
            product.shopifyHandle ||
            "",

          publishedToShopify:
            product.publishedToShopify,

          publishedAt:
            product.publishedAt
              ?.toISOString() ||
            null,

          createdAt:
            product.createdAt
              .toISOString(),

          updatedAt:
            product.updatedAt
              .toISOString(),

          seller: {
            id:
              product.seller.id,

            sellerCode:
              product.seller
                .sellerCode,

            businessName:
              product.seller
                .businessName,

            shopifyVendor:
              product.seller
                .shopifyVendor,

            status:
              product.seller
                .status,
          },
        };
      },
    );


  const sellers =
    Array.from(
      new Map(
        coreProducts.map(
          (
            product,
          ) => [
            product.seller.id,
            {
              id:
                product.seller.id,

              sellerCode:
                product.seller
                  .sellerCode,

              businessName:
                product.seller
                  .businessName,
            },
          ],
        ),
      ).values(),
    ).sort(
      (
        a,
        b,
      ) =>
        a.businessName.localeCompare(
          b.businessName,
        ),
    );


  return {
    products,
    sellers,
  };
};


// ==========================================================
// ACTION
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const {
    admin,
  } =
    await authenticate.admin(
      request,
    );


  const formData =
    await request.formData();


  const productId =
    String(
      formData.get(
        "productId",
      ) ||
      "",
    ).trim();


  const requestedStatus =
    String(
      formData.get(
        "status",
      ) ||
      "",
    )
      .trim()
      .toUpperCase();


  const allowedStatuses =
    [
      "DRAFT",
      "PENDING_APPROVAL",
      "ACTIVE",
      "ARCHIVED",
      "REJECTED",
    ];


  if (!productId) {
    return {
      success:
        false,

      message:
        "Product was not provided.",
    };
  }


  if (
    !allowedStatuses.includes(
      requestedStatus,
    )
  ) {
    return {
      success:
        false,

      message:
        "Invalid product status.",
    };
  }


  const product =
    await db.sellerProduct.findUnique({
      where: {
        id:
          productId,
      },

      include: {
        seller: {
          select: {
            status:
              true,

            businessName:
              true,
          },
        },
      },
    });


  if (!product) {
    return {
      success:
        false,

      message:
        "HairGrab product was not found.",
    };
  }


  if (
    requestedStatus ===
      "ACTIVE" &&
    product.seller.status !==
      "ACTIVE"
  ) {
    return {
      success:
        false,

      message:
        "This product cannot be activated because the seller is not ACTIVE.",
    };
  }


  if (
    !product.shopifyProductId
  ) {
    return {
      success:
        false,

      message:
        "This product does not have a Shopify product connection.",
    };
  }


  // ========================================================
  // MAP HAIRGRAB STATUS TO SAFE SHOPIFY STATUS
  //
  // Only HairGrab ACTIVE becomes Shopify ACTIVE.
  // Everything awaiting work/review remains non-public.
  // ========================================================

  let shopifyStatus =
    "DRAFT";


  if (
    requestedStatus ===
    "ACTIVE"
  ) {
    shopifyStatus =
      "ACTIVE";
  }


  if (
    requestedStatus ===
    "ARCHIVED"
  ) {
    shopifyStatus =
      "ARCHIVED";
  }


  const response =
    await admin.graphql(
      `#graphql
      mutation HairGrabAdminUpdateProductStatus(
        $product: ProductUpdateInput!
      ) {
        productUpdate(
          product: $product
        ) {
          product {
            id
            title
            status
          }

          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          product: {
            id:
              product.shopifyProductId,

            status:
              shopifyStatus,
          },
        },
      },
    );


  const json =
    await response.json();


  if (
    json?.errors?.length
  ) {
    return {
      success:
        false,

      message:
        json.errors
          .map(
            (
              error: {
                message?: string;
              },
            ) =>
              error.message ||
              "Shopify rejected the product update.",
          )
          .join(
            " | ",
          ),
    };
  }


  const userErrors =
    json?.data
      ?.productUpdate
      ?.userErrors ||
    [];


  if (
    userErrors.length >
    0
  ) {
    return {
      success:
        false,

      message:
        userErrors
          .map(
            (
              error: {
                message?: string;
              },
            ) =>
              error.message ||
              "Shopify rejected the product update.",
          )
          .join(
            " | ",
          ),
    };
  }


  const now =
    new Date();


  await db.sellerProduct.update({
    where: {
      id:
        product.id,
    },

    data: {
      status:
        requestedStatus,

      publishedToShopify:
        requestedStatus ===
        "ACTIVE",

      publishedAt:
        requestedStatus ===
        "ACTIVE"
          ? product.publishedAt ||
            now
          : null,
    },
  });


  return {
    success:
      true,

    message:
      requestedStatus ===
      "ACTIVE"
        ? "Product activated and published to HairGrab."
        : `Product moved to ${formatStatus(
            requestedStatus,
          )}.`,
  };
};


// ==========================================================
// PAGE
// ==========================================================

export default function ProductsAdminPage() {
  const {
    products,
    sellers,
  } =
    useLoaderData<
      typeof loader
    >();


  const fetcher =
    useFetcher<
      typeof action
    >();


  const [
    search,
    setSearch,
  ] =
    useState(
      "",
    );


  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState(
      "ALL",
    );


  const [
    sellerFilter,
    setSellerFilter,
  ] =
    useState(
      "ALL",
    );


  const [
    mismatchOnly,
    setMismatchOnly,
  ] =
    useState(
      false,
    );


  const activeCount =
    products.filter(
      (
        product,
      ) =>
        product.coreStatus ===
        "ACTIVE",
    ).length;


  const draftCount =
    products.filter(
      (
        product,
      ) =>
        product.coreStatus ===
        "DRAFT",
    ).length;


  const pendingCount =
    products.filter(
      (
        product,
      ) =>
        product.coreStatus ===
        "PENDING_APPROVAL",
    ).length;


  const mismatchCount =
    products.filter(
      (
        product,
      ) =>
        hasStatusMismatch(
          product.coreStatus,
          product.shopifyStatus,
        ),
    ).length;


  const filteredProducts =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();


        return products.filter(
          (
            product,
          ) => {
            const matchesSearch =
              !query ||
              product.title
                .toLowerCase()
                .includes(
                  query,
                ) ||
              product.seller
                .businessName
                .toLowerCase()
                .includes(
                  query,
                ) ||
              product.seller
                .sellerCode
                .toLowerCase()
                .includes(
                  query,
                ) ||
              product.seller
                .shopifyVendor
                .toLowerCase()
                .includes(
                  query,
                );


            const matchesStatus =
              statusFilter ===
                "ALL" ||
              product.coreStatus ===
                statusFilter;


            const matchesSeller =
              sellerFilter ===
                "ALL" ||
              product.seller.id ===
                sellerFilter;


            const mismatch =
              hasStatusMismatch(
                product.coreStatus,
                product.shopifyStatus,
              );


            return (
              matchesSearch &&
              matchesStatus &&
              matchesSeller &&
              (
                !mismatchOnly ||
                mismatch
              )
            );
          },
        );
      },
      [
        products,
        search,
        statusFilter,
        sellerFilter,
        mismatchOnly,
      ],
    );


  return (
    <div
      style={{
        maxWidth:
          "1260px",
        margin:
          "0 auto",
        padding:
          "28px",
        fontFamily:
          "Arial, sans-serif",
        color:
          "#21152a",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap:
            "15px",
          flexWrap:
            "wrap",
          marginBottom:
            "22px",
        }}
      >
        <div>
          <div
            style={{
              color:
                "#7b3fa0",
              fontSize:
                "11px",
              fontWeight:
                "800",
              textTransform:
                "uppercase",
              letterSpacing:
                "1.3px",
            }}
          >
            HairGrab Marketplace
          </div>

          <h1
            style={{
              margin:
                "6px 0 5px",
              color:
                "#542378",
              fontSize:
                "32px",
            }}
          >
            Products
          </h1>

          <p
            style={{
              margin:
                0,
              color:
                "#756b7b",
              fontSize:
                "13px",
              lineHeight:
                1.6,
            }}
          >
            Review and control products across all HairGrab sellers.
          </p>
        </div>

        <Link
          to="/app"
          style={
            secondaryButtonStyle
          }
        >
          ← HairGrab Core
        </Link>
      </div>


      {/* QUICK GUIDE */}

      <div
        style={{
          ...cardStyle,
          background:
            "#faf7fc",
          marginBottom:
            "20px",
        }}
      >
        <div
          style={{
            color:
              "#542378",
            fontWeight:
              "800",
            fontSize:
              "14px",
          }}
        >
          Product status guide
        </div>

        <div
          style={{
            color:
              "#6f6675",
            fontSize:
              "11px",
            lineHeight:
              1.75,
            marginTop:
              "7px",
          }}
        >
          <strong>
            Draft
          </strong>{" "}
          = seller is still working on it and it is not public.{" "}
          <strong>
            Pending Approval
          </strong>{" "}
          = waiting for HairGrab review and remains a Shopify draft.{" "}
          <strong>
            Active
          </strong>{" "}
          = approved and visible to shoppers.{" "}
          <strong>
            Archived
          </strong>{" "}
          = intentionally removed from sale.{" "}
          <strong>
            Rejected
          </strong>{" "}
          = not approved for HairGrab and remains non-public.
        </div>
      </div>


      {/* ACTION MESSAGE */}

      {fetcher.data?.message && (
        <div
          style={{
            marginBottom:
              "18px",
            padding:
              "13px 15px",
            borderRadius:
              "10px",

            background:
              fetcher.data.success
                ? "#edf8ef"
                : "#fff0f0",

            color:
              fetcher.data.success
                ? "#28743b"
                : "#922f2f",

            border:
              fetcher.data.success
                ? "1px solid #cfe8d4"
                : "1px solid #efcccc",

            fontWeight:
              "700",

            fontSize:
              "12px",
          }}
        >
          {fetcher.data.message}
        </div>
      )}


      {/* SUMMARY */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(170px, 1fr))",
          gap:
            "13px",
          marginBottom:
            "20px",
        }}
      >
        <SummaryCard
          label="Total Products"
          value={
            products.length
          }
        />

        <SummaryCard
          label="Active"
          value={
            activeCount
          }
        />

        <SummaryCard
          label="Draft"
          value={
            draftCount
          }
        />

        <SummaryCard
          label="Pending Approval"
          value={
            pendingCount
          }
        />

        <SummaryCard
          label="Status Mismatches"
          value={
            mismatchCount
          }
        />
      </div>


      {/* FILTERS */}

      <div
        style={{
          ...cardStyle,
          marginBottom:
            "20px",
        }}
      >
        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "minmax(240px, 2fr) minmax(160px, 1fr) minmax(190px, 1fr)",
            gap:
              "10px",
          }}
        >
          <input
            value={
              search
            }
            onChange={(
              event,
            ) =>
              setSearch(
                event.target
                  .value,
              )
            }
            placeholder="Search product, seller or Seller ID"
            style={
              inputStyle
            }
          />

          <select
            value={
              statusFilter
            }
            onChange={(
              event,
            ) =>
              setStatusFilter(
                event.target
                  .value,
              )
            }
            style={
              inputStyle
            }
          >
            <option value="ALL">
              All Product Statuses
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="DRAFT">
              Draft
            </option>

            <option value="PENDING_APPROVAL">
              Pending Approval
            </option>

            <option value="ARCHIVED">
              Archived
            </option>

            <option value="REJECTED">
              Rejected
            </option>
          </select>

          <select
            value={
              sellerFilter
            }
            onChange={(
              event,
            ) =>
              setSellerFilter(
                event.target
                  .value,
              )
            }
            style={
              inputStyle
            }
          >
            <option value="ALL">
              All Sellers
            </option>

            {sellers.map(
              (
                seller,
              ) => (
                <option
                  key={
                    seller.id
                  }
                  value={
                    seller.id
                  }
                >
                  {seller.sellerCode}
                  {" — "}
                  {seller.businessName}
                </option>
              ),
            )}
          </select>
        </div>


        <label
          style={{
            display:
              "inline-flex",
            alignItems:
              "center",
            gap:
              "7px",
            marginTop:
              "12px",
            color:
              "#6f6675",
            fontSize:
              "11px",
            fontWeight:
              "700",
            cursor:
              "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={
              mismatchOnly
            }
            onChange={(
              event,
            ) =>
              setMismatchOnly(
                event.target
                  .checked,
              )
            }
          />

          Show only Core / Shopify status mismatches
        </label>


        <div
          style={{
            marginTop:
              "10px",
            color:
              "#817787",
            fontSize:
              "10px",
          }}
        >
          Showing{" "}
          {
            filteredProducts.length
          }{" "}
          of{" "}
          {
            products.length
          }{" "}
          products.
        </div>
      </div>


      {/* PRODUCTS TABLE */}

      <div
        style={
          cardStyle
        }
      >
        {filteredProducts.length ===
        0 ? (
          <div
            style={
              emptyStyle
            }
          >
            No products match these filters.
          </div>
        ) : (
          <div
            style={{
              overflowX:
                "auto",
            }}
          >
            <table
              style={{
                width:
                  "100%",
                borderCollapse:
                  "collapse",
                minWidth:
                  "1150px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      "#f8f1fc",
                  }}
                >
                  <th style={tableHeaderStyle}>
                    Product
                  </th>

                  <th style={tableHeaderStyle}>
                    Seller
                  </th>

                  <th style={tableHeaderStyle}>
                    Core Status
                  </th>

                  <th style={tableHeaderStyle}>
                    Shopify Status
                  </th>

                  <th style={tableHeaderStyle}>
                    Published
                  </th>

                  <th style={tableHeaderStyle}>
                    Updated
                  </th>

                  <th style={tableHeaderStyle}>
                    Action
                  </th>
                </tr>
              </thead>


              <tbody>
                {filteredProducts.map(
                  (
                    product,
                  ) => {
                    const mismatch =
                      hasStatusMismatch(
                        product.coreStatus,
                        product.shopifyStatus,
                      );


                    return (
                      <tr
                        key={
                          product.id
                        }
                      >
                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <div
                            style={{
                              fontWeight:
                                "800",
                              color:
                                "#2b1b35",
                              maxWidth:
                                "260px",
                            }}
                          >
                            {
                              product.title
                            }
                          </div>

                          {product.shopifyHandle &&
                            product.shopifyStatus ===
                              "ACTIVE" && (
                              <a
                                href={`https://hairgrab.com/products/${product.shopifyHandle}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display:
                                    "inline-block",
                                  color:
                                    "#542378",
                                  fontSize:
                                    "9px",
                                  textDecoration:
                                    "none",
                                  marginTop:
                                    "4px",
                                  fontWeight:
                                    "700",
                                }}
                              >
                                Store View ↗
                              </a>
                            )}
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <Link
                            to={`/app/seller/${product.seller.sellerCode}`}
                            style={{
                              color:
                                "#542378",
                              fontWeight:
                                "800",
                              textDecoration:
                                "none",
                            }}
                          >
                            {
                              product.seller
                                .sellerCode
                            }
                          </Link>

                          <div
                            style={{
                              color:
                                "#817787",
                              fontSize:
                                "9px",
                              marginTop:
                                "3px",
                            }}
                          >
                            {
                              product.seller
                                .businessName
                            }
                          </div>
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <StatusBadge
                            status={
                              product.coreStatus
                            }
                          />
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <StatusBadge
                            status={
                              product.shopifyStatus
                            }
                          />

                          {mismatch && (
                            <div
                              style={{
                                color:
                                  "#922f2f",
                                fontSize:
                                  "8px",
                                fontWeight:
                                  "800",
                                marginTop:
                                  "4px",
                              }}
                            >
                              ⚠ Status mismatch
                            </div>
                          )}
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {
                            product.publishedToShopify
                              ? "Yes"
                              : "No"
                          }
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {formatDate(
                            product.updatedAt,
                          )}
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <ProductActions
                            productId={
                              product.id
                            }
                            currentStatus={
                              product.coreStatus
                            }
                            disabled={
                              fetcher.state !==
                              "idle"
                            }
                            onChange={(
                              status,
                            ) => {
                              fetcher.submit(
                                {
                                  productId:
                                    product.id,

                                  status,
                                },
                                {
                                  method:
                                    "post",
                                },
                              );
                            }}
                          />
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>


      <div
        style={{
          marginTop:
            "20px",
        }}
      >
        <Link
          to="/app"
          style={
            secondaryButtonStyle
          }
        >
          ← Back to HairGrab Core
        </Link>
      </div>
    </div>
  );
}


// ==========================================================
// COMPONENTS
// ==========================================================

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      style={
        cardStyle
      }
    >
      <div
        style={{
          color:
            "#817787",
          fontSize:
            "10px",
          fontWeight:
            "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color:
            "#542378",
          fontSize:
            "28px",
          fontWeight:
            "800",
          marginTop:
            "5px",
        }}
      >
        {value}
      </div>
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
      "",
    ).toUpperCase();


  let background =
    "#f4f1f6";

  let color =
    "#665c6b";


  if (
    normalized ===
      "ACTIVE" ||
    normalized ===
      "COMPLETE"
  ) {
    background =
      "#edf8ef";

    color =
      "#28743b";
  }


  if (
    normalized ===
      "DRAFT" ||
    normalized ===
      "PENDING_APPROVAL"
  ) {
    background =
      "#fff8e7";

    color =
      "#805c12";
  }


  if (
    normalized ===
      "REJECTED" ||
    normalized ===
      "MISSING"
  ) {
    background =
      "#fff0f0";

    color =
      "#922f2f";
  }


  return (
    <span
      style={{
        display:
          "inline-block",
        background,
        color,
        borderRadius:
          "18px",
        padding:
          "5px 8px",
        fontSize:
          "9px",
        fontWeight:
          "800",
        whiteSpace:
          "nowrap",
      }}
    >
      {formatStatus(
        normalized,
      )}
    </span>
  );
}


function ProductActions({
  productId,
  currentStatus,
  disabled,
  onChange,
}: {
  productId: string;
  currentStatus: string;
  disabled: boolean;
  onChange:
    (
      status: string,
    ) => void;
}) {
  void productId;


  return (
    <select
      value=""
      disabled={
        disabled
      }
      onChange={(
        event,
      ) => {
        const status =
          event.target.value;

        if (!status) {
          return;
        }


        const label =
          formatStatus(
            status,
          );


        const confirmed =
          window.confirm(
            `Move this product to ${label}?`,
          );


        if (!confirmed) {
          event.target.value =
            "";

          return;
        }


        onChange(
          status,
        );

        event.target.value =
          "";
      }}
      style={{
        ...inputStyle,
        minWidth:
          "145px",
        fontSize:
          "10px",
        padding:
          "7px",
      }}
    >
      <option value="">
        Manage…
      </option>

      {currentStatus !==
        "ACTIVE" && (
        <option value="ACTIVE">
          Activate
        </option>
      )}

      {currentStatus !==
        "DRAFT" && (
        <option value="DRAFT">
          Move to Draft
        </option>
      )}

      {currentStatus !==
        "PENDING_APPROVAL" && (
        <option value="PENDING_APPROVAL">
          Pending Approval
        </option>
      )}

      {currentStatus !==
        "ARCHIVED" && (
        <option value="ARCHIVED">
          Archive
        </option>
      )}

      {currentStatus !==
        "REJECTED" && (
        <option value="REJECTED">
          Reject
        </option>
      )}
    </select>
  );
}


// ==========================================================
// STATUS SAFETY
// ==========================================================

function hasStatusMismatch(
  coreStatus: string,
  shopifyStatus: string,
) {
  const core =
    coreStatus.toUpperCase();

  const shopify =
    shopifyStatus.toUpperCase();


  if (
    core ===
    "ACTIVE"
  ) {
    return shopify !==
      "ACTIVE";
  }


  if (
    core ===
    "ARCHIVED"
  ) {
    return shopify !==
      "ARCHIVED";
  }


  if (
    core ===
      "DRAFT" ||
    core ===
      "PENDING_APPROVAL" ||
    core ===
      "REJECTED"
  ) {
    return shopify !==
      "DRAFT";
  }


  return false;
}


// ==========================================================
// STYLES
// ==========================================================

const cardStyle = {
  background:
    "#ffffff",

  border:
    "1px solid #e5d8ef",

  borderRadius:
    "14px",

  padding:
    "20px",

  boxShadow:
    "0 2px 8px rgba(84, 35, 120, 0.06)",
};


const inputStyle = {
  width:
    "100%",

  boxSizing:
    "border-box" as const,

  border:
    "1px solid #d9c9e4",

  borderRadius:
    "8px",

  padding:
    "10px 11px",

  fontSize:
    "11px",

  background:
    "#ffffff",

  color:
    "#21152a",
};


const tableHeaderStyle = {
  padding:
    "10px",

  textAlign:
    "left" as const,

  fontSize:
    "9px",

  color:
    "#542378",

  textTransform:
    "uppercase" as const,
};


const tableCellStyle = {
  padding:
    "12px 10px",

  borderBottom:
    "1px solid #eee6f2",

  verticalAlign:
    "middle" as const,

  fontSize:
    "10px",

  color:
    "#35273d",
};


const secondaryButtonStyle = {
  display:
    "inline-block",

  background:
    "#ffffff",

  color:
    "#542378",

  border:
    "1px solid #d8c8e2",

  borderRadius:
    "8px",

  padding:
    "9px 12px",

  textDecoration:
    "none",

  fontWeight:
    "800",

  fontSize:
    "10px",
};


const emptyStyle = {
  padding:
    "35px",

  background:
    "#fcf9fe",

  border:
    "1px dashed #d9c9e4",

  borderRadius:
    "10px",

  textAlign:
    "center" as const,

  color:
    "#756b7b",

  fontSize:
    "11px",
};