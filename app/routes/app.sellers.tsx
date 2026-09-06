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


type ShopifyVendor = {
  vendor: string;
};


type ShopifyVendorResponse = {
  data?: {
    productVendors?: {
      edges?: Array<{
        node?: string;
      }>;
    };
  };

  errors?: Array<{
    message?: string;
  }>;
};


// ===========================================================
// LOADER
// ===========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { admin } =
    await authenticate.admin(
      request,
    );

  const sellers =
    await db.seller.findMany({
      include: {
        onboarding: {
          select: {
            status: true,
            currentStep: true,
            completedAt: true,
          },
        },

        _count: {
          select: {
            products: true,
          },
        },
      },

      orderBy: {
        sellerCode:
          "asc",
      },
    });


  // =========================================================
  // READ EXISTING SHOPIFY PRODUCT VENDORS
  // =========================================================

  let shopifyVendors:
    ShopifyVendor[] =
    [];

  let shopifyError:
    string |
    null =
    null;


  try {
    const response =
      await admin.graphql(
        `#graphql
        query HairGrabProductVendors {
          productVendors(first: 250) {
            edges {
              node
            }
          }
        }
        `,
      );


    const result =
      (
        await response.json()
      ) as ShopifyVendorResponse;


    if (
      result.errors &&
      result.errors.length >
        0
    ) {
      shopifyError =
        result.errors
          .map(
            (error) =>
              error.message,
          )
          .filter(Boolean)
          .join(", ") ||
        "Unable to load Shopify vendors.";
    } else {
      const vendorNames =
        result.data
          ?.productVendors
          ?.edges
          ?.map(
            (edge) =>
              edge.node,
          )
          .filter(
            (
              vendor,
            ): vendor is string =>
              typeof vendor ===
                "string" &&
              vendor.trim()
                .length >
                0,
          ) ??
        [];


      shopifyVendors =
        Array.from(
          new Set(
            vendorNames.map(
              (vendor) =>
                vendor.trim(),
            ),
          ),
        )
          .sort(
            (
              a,
              b,
            ) =>
              a.localeCompare(
                b,
              ),
          )
          .map(
            (vendor) => ({
              vendor,
            }),
          );
    }
  } catch (error) {
    shopifyError =
      error instanceof
      Error
        ? error.message
        : "Unable to load Shopify vendors.";
  }


  const registeredVendorNames =
    new Set(
      sellers.map(
        (seller) =>
          seller.shopifyVendor
            .trim()
            .toLowerCase(),
      ),
    );


  const vendorsAvailableToSync =
    shopifyVendors.filter(
      ({
        vendor,
      }) =>
        !registeredVendorNames.has(
          vendor.toLowerCase(),
        ),
    );


  return {
    sellers,
    shopifyVendors,
    vendorsAvailableToSync,
    shopifyError,
  };
};


// ===========================================================
// ACTION
// Sync existing Shopify vendor into HairGrab Core
// ===========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  await authenticate.admin(
    request,
  );

  const formData =
    await request.formData();

  const intent =
    String(
      formData.get(
        "intent",
      ) ||
        "",
    );


  if (
    intent !==
    "sync-shopify-vendor"
  ) {
    return {
      success:
        false,

      message:
        "Unknown seller action.",
    };
  }


  const shopifyVendor =
    String(
      formData.get(
        "shopifyVendor",
      ) ||
        "",
    ).trim();


  if (!shopifyVendor) {
    return {
      success:
        false,

      message:
        "Shopify vendor was not provided.",
    };
  }


  try {
    const existingSeller =
      await db.seller.findUnique({
        where: {
          shopifyVendor,
        },
      });


    if (
      existingSeller
    ) {
      return {
        success:
          false,

        message:
          `${shopifyVendor} is already registered as ${existingSeller.sellerCode}.`,
      };
    }


    const sellers =
      await db.seller.findMany({
        select: {
          sellerCode:
            true,
        },
      });


    let highestSellerNumber =
      0;


    for (
      const seller of
      sellers
    ) {
      const match =
        seller.sellerCode.match(
          /^HG-(\d+)$/,
        );

      if (!match) {
        continue;
      }

      const number =
        Number(
          match[1],
        );

      if (
        Number.isFinite(
          number,
        ) &&
        number >
          highestSellerNumber
      ) {
        highestSellerNumber =
          number;
      }
    }


    const nextSellerNumber =
      highestSellerNumber +
      1;


    const sellerCode =
      `HG-${String(
        nextSellerNumber,
      ).padStart(
        4,
        "0",
      )}`;


    const seller =
      await db.seller.create({
        data: {
          sellerCode,

          businessName:
            shopifyVendor,

          shopifyVendor,

          status:
            "ACTIVE",

          commissionRate:
            7,

          payoutStatus:
            "NOT_CONNECTED",
        },
      });


    return {
      success:
        true,

      message:
        `${seller.businessName} synced successfully as ${seller.sellerCode}.`,
    };
  } catch (error) {
    return {
      success:
        false,

      message:
        error instanceof
        Error
          ? error.message
          : "Unable to sync seller.",
    };
  }
};


// ===========================================================
// PAGE
// ===========================================================

export default function SellersPage() {
  const {
    sellers,
    shopifyVendors,
    vendorsAvailableToSync,
    shopifyError,
  } =
    useLoaderData<
      typeof loader
    >();


  const syncFetcher =
    useFetcher<
      typeof action
    >();


  const actionData =
    syncFetcher.data;


  const isSyncing =
    syncFetcher.state !==
    "idle";


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
    payoutFilter,
    setPayoutFilter,
  ] =
    useState(
      "ALL",
    );


  const [
    onboardingFilter,
    setOnboardingFilter,
  ] =
    useState(
      "ALL",
    );


  const activeSellerCount =
    sellers.filter(
      (seller) =>
        seller.status ===
        "ACTIVE",
    ).length;


  const inactiveSellerCount =
    sellers.filter(
      (seller) =>
        seller.status ===
          "INACTIVE" ||
        seller.status ===
          "SUSPENDED" ||
        seller.status ===
          "CLOSED",
    ).length;


  const payoutConnectedCount =
    sellers.filter(
      (seller) =>
        seller.payoutStatus ===
        "CONNECTED",
    ).length;


  const payoutIssueCount =
    sellers.filter(
      (seller) =>
        seller.payoutStatus !==
        "CONNECTED",
    ).length;


  const onboardingIncompleteCount =
    sellers.filter(
      (seller) =>
        seller.onboarding
          ?.status !==
        "COMPLETE",
    ).length;


  const filteredSellers =
    useMemo(
      () => {
        const normalizedSearch =
          search
            .trim()
            .toLowerCase();


        return sellers.filter(
          (seller) => {
            const contactName =
              [
                seller.contactFirstName,
                seller.contactLastName,
              ]
                .filter(
                  Boolean,
                )
                .join(
                  " ",
                )
                .toLowerCase();


            const matchesSearch =
              !normalizedSearch ||
              seller.sellerCode
                .toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              seller.businessName
                .toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              seller.shopifyVendor
                .toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              (
                seller.email ||
                ""
              )
                .toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              contactName.includes(
                normalizedSearch,
              );


            const matchesStatus =
              statusFilter ===
                "ALL" ||
              seller.status ===
                statusFilter;


            const matchesPayout =
              payoutFilter ===
                "ALL" ||
              (
                payoutFilter ===
                  "CONNECTED" &&
                seller.payoutStatus ===
                  "CONNECTED"
              ) ||
              (
                payoutFilter ===
                  "ISSUE" &&
                seller.payoutStatus !==
                  "CONNECTED"
              );


            const onboardingComplete =
              seller.onboarding
                ?.status ===
              "COMPLETE";


            const matchesOnboarding =
              onboardingFilter ===
                "ALL" ||
              (
                onboardingFilter ===
                  "COMPLETE" &&
                onboardingComplete
              ) ||
              (
                onboardingFilter ===
                  "INCOMPLETE" &&
                !onboardingComplete
              );


            return (
              matchesSearch &&
              matchesStatus &&
              matchesPayout &&
              matchesOnboarding
            );
          },
        );
      },
      [
        sellers,
        search,
        statusFilter,
        payoutFilter,
        onboardingFilter,
      ],
    );


  const clearFilters =
    () => {
      setSearch(
        "",
      );

      setStatusFilter(
        "ALL",
      );

      setPayoutFilter(
        "ALL",
      );

      setOnboardingFilter(
        "ALL",
      );
    };


  return (
    <div
      style={{
        maxWidth:
          "1240px",
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
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap:
            "18px",
          flexWrap:
            "wrap",
          marginBottom:
            "24px",
        }}
      >
        <div>
          <div
            style={{
              color:
                "#7b3fa0",
              fontSize:
                "12px",
              fontWeight:
                "800",
              textTransform:
                "uppercase",
              letterSpacing:
                "1.4px",
              marginBottom:
                "6px",
            }}
          >
            HairGrab Marketplace
          </div>

          <h1
            style={{
              margin:
                0,
              color:
                "#542378",
              fontSize:
                "32px",
            }}
          >
            Sellers
          </h1>

          <p
            style={{
              color:
                "#6f6675",
              fontSize:
                "14px",
              lineHeight:
                1.6,
              margin:
                "8px 0 0",
              maxWidth:
                "680px",
            }}
          >
            Manage HairGrab sellers,
            onboarding, marketplace
            status, commission,
            products and payout
            readiness from one place.
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


      {/* =====================================================
          QUICK HELP
      ===================================================== */}

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
          How to use this page
        </div>

        <div
          style={{
            color:
              "#6f6675",
            fontSize:
              "12px",
            lineHeight:
              1.65,
            marginTop:
              "7px",
          }}
        >
          Search or filter to find
          a seller. Use{" "}
          <strong>
            Manage
          </strong>{" "}
          to review their account,
          marketplace status,
          commission and payout
          setup. A payout issue means
          the seller is not currently
          marked CONNECTED. Seller
          products are managed
          separately from registration
          and onboarding.
        </div>
      </div>


      {/* =====================================================
          ACTION RESULT
      ===================================================== */}

      {actionData?.message && (
        <div
          style={{
            marginBottom:
              "20px",
            padding:
              "14px 16px",
            borderRadius:
              "10px",

            background:
              actionData.success
                ? "#eef8f0"
                : "#fff0f0",

            border:
              actionData.success
                ? "1px solid #cbe3d0"
                : "1px solid #efc0c0",

            color:
              actionData.success
                ? "#2f6b3c"
                : "#9a2929",

            fontWeight:
              "700",
            fontSize:
              "13px",
          }}
        >
          {actionData.message}
        </div>
      )}


      {/* =====================================================
          SUMMARY CARDS
      ===================================================== */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(175px, 1fr))",
          gap:
            "14px",
          marginBottom:
            "24px",
        }}
      >
        <SummaryCard
          label="Total Sellers"
          value={
            sellers.length
          }
          help="All seller records in HairGrab Core."
        />

        <SummaryCard
          label="Active Sellers"
          value={
            activeSellerCount
          }
          help="Sellers currently allowed to participate in the marketplace."
        />

        <SummaryCard
          label="Inactive / Restricted"
          value={
            inactiveSellerCount
          }
          help="Inactive, suspended or closed seller accounts."
        />

        <SummaryCard
          label="Payout Connected"
          value={
            payoutConnectedCount
          }
          help="Sellers currently connected for Stripe payouts."
        />

        <SummaryCard
          label="Payout Issues"
          value={
            payoutIssueCount
          }
          help="Sellers that are not currently payout connected."
        />

        <SummaryCard
          label="Setup Incomplete"
          value={
            onboardingIncompleteCount
          }
          help="Seller accounts that have not completed HairGrab onboarding."
        />
      </div>


      {/* =====================================================
          SELLER REGISTRY
      ===================================================== */}

      <div
        style={{
          ...cardStyle,
          marginBottom:
            "24px",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "flex-start",
            gap:
              "12px",
            flexWrap:
              "wrap",
            marginBottom:
              "18px",
          }}
        >
          <div>
            <h2
              style={{
                margin:
                  0,
                color:
                  "#542378",
                fontSize:
                  "21px",
              }}
            >
              Seller Registry
            </h2>

            <div
              style={{
                color:
                  "#756b7b",
                fontSize:
                  "12px",
                marginTop:
                  "5px",
              }}
            >
              Showing{" "}
              {
                filteredSellers.length
              }{" "}
              of{" "}
              {
                sellers.length
              }{" "}
              sellers.
            </div>
          </div>

          <Link
            to="/app/applications"
            style={
              primaryButtonStyle
            }
          >
            Seller Applications
          </Link>
        </div>


        {/* SEARCH */}

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "minmax(220px, 2fr) repeat(3, minmax(150px, 1fr))",
            gap:
              "10px",
            marginBottom:
              "12px",
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
            placeholder="Search Seller ID, business, contact, email or Shopify vendor"
            style={
              filterFieldStyle
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
              filterFieldStyle
            }
          >
            <option value="ALL">
              All Statuses
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="INACTIVE">
              Inactive
            </option>

            <option value="SUSPENDED">
              Suspended
            </option>

            <option value="CLOSED">
              Closed
            </option>
          </select>

          <select
            value={
              payoutFilter
            }
            onChange={(
              event,
            ) =>
              setPayoutFilter(
                event.target
                  .value,
              )
            }
            style={
              filterFieldStyle
            }
          >
            <option value="ALL">
              All Payout Statuses
            </option>

            <option value="CONNECTED">
              Payout Connected
            </option>

            <option value="ISSUE">
              Payout Issue
            </option>
          </select>

          <select
            value={
              onboardingFilter
            }
            onChange={(
              event,
            ) =>
              setOnboardingFilter(
                event.target
                  .value,
              )
            }
            style={
              filterFieldStyle
            }
          >
            <option value="ALL">
              All Setup Statuses
            </option>

            <option value="COMPLETE">
              Setup Complete
            </option>

            <option value="INCOMPLETE">
              Setup Incomplete
            </option>
          </select>
        </div>


        <div
          style={{
            display:
              "flex",
            gap:
              "8px",
            flexWrap:
              "wrap",
            marginBottom:
              "18px",
          }}
        >
          {[
            "ALL",
            "ACTIVE",
            "INACTIVE",
            "SUSPENDED",
            "CLOSED",
          ].map(
            (
              status,
            ) => (
              <button
                key={
                  status
                }
                type="button"
                onClick={() =>
                  setStatusFilter(
                    status,
                  )
                }
                style={{
                  border:
                    statusFilter ===
                    status
                      ? "1px solid #542378"
                      : "1px solid #ded3e5",

                  background:
                    statusFilter ===
                    status
                      ? "#542378"
                      : "#ffffff",

                  color:
                    statusFilter ===
                    status
                      ? "#ffffff"
                      : "#542378",

                  borderRadius:
                    "20px",

                  padding:
                    "7px 11px",

                  fontSize:
                    "11px",

                  fontWeight:
                    "800",

                  cursor:
                    "pointer",
                }}
              >
                {status ===
                "ALL"
                  ? "All"
                  : formatStatus(
                      status,
                    )}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => {
              setStatusFilter(
                "ALL",
              );

              setPayoutFilter(
                "ISSUE",
              );
            }}
            style={{
              border:
                payoutFilter ===
                "ISSUE"
                  ? "1px solid #922f2f"
                  : "1px solid #e3caca",

              background:
                payoutFilter ===
                "ISSUE"
                  ? "#fff0f0"
                  : "#ffffff",

              color:
                "#922f2f",

              borderRadius:
                "20px",

              padding:
                "7px 11px",

              fontSize:
                "11px",

              fontWeight:
                "800",

              cursor:
                "pointer",
            }}
          >
            Payout Issue
          </button>

          <button
            type="button"
            onClick={
              clearFilters
            }
            style={{
              border:
                "none",
              background:
                "transparent",
              color:
                "#756b7b",
              padding:
                "7px 8px",
              fontSize:
                "11px",
              fontWeight:
                "700",
              cursor:
                "pointer",
            }}
          >
            Clear Filters
          </button>
        </div>


        {filteredSellers.length ===
        0 ? (
          <div
            style={
              emptyStyle
            }
          >
            No sellers match
            these filters.
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
                  "1100px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      "#f8f1fc",
                  }}
                >
                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Seller ID
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Business
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Shopify Vendor
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Marketplace
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Setup
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Products
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Commission
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Payout
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredSellers.map(
                  (
                    seller,
                  ) => {
                    const onboardingComplete =
                      seller
                        .onboarding
                        ?.status ===
                      "COMPLETE";


                    return (
                      <tr
                        key={
                          seller.id
                        }
                      >
                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <Link
                            to={`/app/seller/${seller.sellerCode}`}
                            style={
                              sellerLinkStyle
                            }
                          >
                            {
                              seller.sellerCode
                            }
                          </Link>
                        </td>

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
                            }}
                          >
                            {
                              seller.businessName
                            }
                          </div>

                          <div
                            style={{
                              fontSize:
                                "10px",
                              color:
                                "#817787",
                              marginTop:
                                "3px",
                            }}
                          >
                            {
                              seller.email ||
                              "No email"
                            }
                          </div>
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {
                            seller.shopifyVendor
                          }
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <StatusBadge
                            status={
                              seller.status
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
                              onboardingComplete
                                ? "COMPLETE"
                                : "INCOMPLETE"
                            }
                          />

                          {!onboardingComplete &&
                            seller
                              .onboarding
                              ?.currentStep && (
                              <div
                                style={{
                                  color:
                                    "#817787",
                                  fontSize:
                                    "9px",
                                  marginTop:
                                    "4px",
                                }}
                              >
                                Current:{" "}
                                {
                                  seller
                                    .onboarding
                                    .currentStep
                                }
                              </div>
                            )}
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <strong>
                            {
                              seller
                                ._count
                                .products
                            }
                          </strong>

                          <span
                            style={{
                              color:
                                "#817787",
                              fontSize:
                                "10px",
                            }}
                          >
                            {" "}
                            /{" "}
                            {
                              seller.activeProductLimit
                            }{" "}
                            limit
                          </span>
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <strong>
                            {
                              seller.commissionRate
                            }
                            %
                          </strong>
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <StatusBadge
                            status={
                              seller.payoutStatus
                            }
                          />
                        </td>

                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <Link
                            to={`/app/seller/${seller.sellerCode}`}
                            style={
                              primarySmallButtonStyle
                            }
                          >
                            Manage
                          </Link>
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


      {/* =====================================================
          SHOPIFY VENDOR SYNC
      ===================================================== */}

      <div
        style={{
          ...cardStyle,
          marginBottom:
            "24px",
        }}
      >
        <div
          style={{
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
            <h2
              style={{
                margin:
                  0,
                color:
                  "#542378",
                fontSize:
                  "20px",
              }}
            >
              Shopify Vendor Sync
            </h2>

            <p
              style={{
                margin:
                  "6px 0 0",
                color:
                  "#756b7b",
                fontSize:
                  "12px",
                lineHeight:
                  1.5,
                maxWidth:
                  "650px",
              }}
            >
              This is mainly for
              legacy or existing
              Shopify vendors. New
              HairGrab sellers should
              normally enter through
              the HairGrab seller
              application and
              onboarding flow.
            </p>
          </div>

          <div
            style={{
              background:
                "#f8f1fc",
              color:
                "#542378",
              borderRadius:
                "20px",
              padding:
                "7px 12px",
              fontWeight:
                "700",
              fontSize:
                "12px",
            }}
          >
            {
              vendorsAvailableToSync.length
            }{" "}
            available
          </div>
        </div>


        {shopifyError ? (
          <div
            style={{
              marginTop:
                "18px",
              padding:
                "14px",
              background:
                "#fff0f0",
              border:
                "1px solid #efc0c0",
              borderRadius:
                "10px",
              color:
                "#9a2929",
              fontSize:
                "12px",
            }}
          >
            Shopify vendor
            sync unavailable:{" "}
            {
              shopifyError
            }
          </div>
        ) : vendorsAvailableToSync.length ===
          0 ? (
          <div
            style={{
              ...emptyStyle,
              marginTop:
                "18px",
            }}
          >
            {shopifyVendors.length ===
            0
              ? "No Shopify product vendors were found."
              : "All Shopify vendors are already registered in HairGrab Core."}
          </div>
        ) : (
          <div
            style={{
              overflowX:
                "auto",
              marginTop:
                "18px",
            }}
          >
            <table
              style={{
                width:
                  "100%",
                borderCollapse:
                  "collapse",
                minWidth:
                  "650px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      "#f8f1fc",
                  }}
                >
                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Shopify Vendor
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Default Commission
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Core Status
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {vendorsAvailableToSync.map(
                  ({
                    vendor,
                  }) => (
                    <tr
                      key={
                        vendor
                      }
                    >
                      <td
                        style={{
                          ...tableCellStyle,
                          fontWeight:
                            "700",
                        }}
                      >
                        {
                          vendor
                        }
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        7%
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        <StatusBadge
                          status="NOT REGISTERED"
                        />
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        <button
                          type="button"
                          disabled={
                            isSyncing
                          }
                          onClick={() => {
                            syncFetcher.submit(
                              {
                                intent:
                                  "sync-shopify-vendor",

                                shopifyVendor:
                                  vendor,
                              },
                              {
                                method:
                                  "post",
                              },
                            );
                          }}
                          style={{
                            ...primarySmallButtonStyle,

                            border:
                              "none",

                            cursor:
                              isSyncing
                                ? "wait"
                                : "pointer",

                            opacity:
                              isSyncing
                                ? 0.65
                                : 1,
                          }}
                        >
                          {isSyncing
                            ? "Syncing..."
                            : "Sync"}
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>


      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          gap:
            "12px",
          flexWrap:
            "wrap",
          alignItems:
            "center",
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

        <div
          style={{
            color:
              "#817787",
            fontSize:
              "10px",
          }}
        >
          HairGrab Core seller
          management
        </div>
      </div>
    </div>
  );
}


// ===========================================================
// COMPONENTS
// ===========================================================

function SummaryCard({
  label,
  value,
  help,
}: {
  label: string;
  value: number;
  help: string;
}) {
  return (
    <div
      style={
        cardStyle
      }
      title={
        help
      }
    >
      <div
        style={{
          fontSize:
            "12px",
          color:
            "#6f6675",
          fontWeight:
            "700",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize:
            "29px",
          fontWeight:
            "800",
          color:
            "#542378",
          marginTop:
            "7px",
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize:
            "9px",
          color:
            "#95899a",
          lineHeight:
            1.4,
          marginTop:
            "6px",
        }}
      >
        {help}
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
    )
      .trim()
      .toUpperCase();


  let background =
    "#f4f1f6";

  let color =
    "#665c6b";

  let border =
    "#e2dbe6";


  if (
    normalized ===
      "ACTIVE" ||
    normalized ===
      "CONNECTED" ||
    normalized ===
      "COMPLETE"
  ) {
    background =
      "#edf8ef";

    color =
      "#28743b";

    border =
      "#cfe8d4";
  } else if (
    normalized ===
      "SUSPENDED" ||
    normalized ===
      "RESTRICTED" ||
    normalized ===
      "CLOSED"
  ) {
    background =
      "#fff0f0";

    color =
      "#922f2f";

    border =
      "#efcccc";
  } else if (
    normalized ===
      "PENDING" ||
    normalized ===
      "NOT_CONNECTED" ||
    normalized ===
      "INCOMPLETE"
  ) {
    background =
      "#fff8e7";

    color =
      "#805c12";

    border =
      "#ead9a8";
  }


  return (
    <span
      style={{
        display:
          "inline-block",
        background,
        color,
        border:
          `1px solid ${border}`,
        borderRadius:
          "20px",
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


function formatStatus(
  status: string,
) {
  return status
    .replace(
      /_/g,
      " ",
    )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (
        character,
      ) =>
        character.toUpperCase(),
    );
}


// ===========================================================
// STYLES
// ===========================================================

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


const sellerLinkStyle = {
  color:
    "#542378",

  fontWeight:
    "800",

  textDecoration:
    "none",
};


const tableHeaderStyle = {
  padding:
    "11px 10px",

  textAlign:
    "left" as const,

  fontSize:
    "10px",

  color:
    "#542378",

  textTransform:
    "uppercase" as const,

  letterSpacing:
    "0.4px",
};


const tableCellStyle = {
  padding:
    "13px 10px",

  fontSize:
    "12px",

  borderBottom:
    "1px solid #eee6f2",

  verticalAlign:
    "middle" as const,
};


const filterFieldStyle = {
  width:
    "100%",

  boxSizing:
    "border-box" as const,

  border:
    "1px solid #d8cce0",

  borderRadius:
    "9px",

  padding:
    "10px 11px",

  background:
    "#ffffff",

  color:
    "#21152a",

  fontSize:
    "12px",
};


const primaryButtonStyle = {
  display:
    "inline-block",

  background:
    "#542378",

  color:
    "#ffffff",

  borderRadius:
    "9px",

  padding:
    "10px 13px",

  textDecoration:
    "none",

  fontWeight:
    "800",

  fontSize:
    "12px",
};


const primarySmallButtonStyle = {
  display:
    "inline-block",

  background:
    "#542378",

  color:
    "#ffffff",

  borderRadius:
    "8px",

  padding:
    "8px 11px",

  textDecoration:
    "none",

  fontWeight:
    "800",

  fontSize:
    "10px",
};


const secondaryButtonStyle = {
  display:
    "inline-block",

  color:
    "#542378",

  border:
    "1px solid #d8c8e2",

  borderRadius:
    "9px",

  padding:
    "9px 12px",

  textDecoration:
    "none",

  fontWeight:
    "800",

  fontSize:
    "11px",

  background:
    "#ffffff",
};


const emptyStyle = {
  padding:
    "30px",

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
    "12px",
};