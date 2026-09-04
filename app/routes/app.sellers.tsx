import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useFetcher,
  useLoaderData,
} from "react-router";

import { authenticate } from "../shopify.server";
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


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { admin } =
    await authenticate.admin(request);

  const sellers =
    await db.seller.findMany({
      orderBy: {
        sellerCode: "asc",
      },
    });


  // =========================================================
  // READ EXISTING SHOPIFY PRODUCT VENDORS
  // =========================================================

  let shopifyVendors: ShopifyVendor[] = [];
  let shopifyError: string | null = null;

  try {
    const response = await admin.graphql(`
      #graphql
      query HairGrabProductVendors {
        productVendors(first: 250) {
          edges {
            node
          }
        }
      }
    `);

    const result =
      (await response.json()) as ShopifyVendorResponse;

    if (
      result.errors &&
      result.errors.length > 0
    ) {
      shopifyError =
        result.errors
          .map((error) => error.message)
          .filter(Boolean)
          .join(", ") ||
        "Unable to load Shopify vendors.";
    } else {
      const vendorNames =
        result.data?.productVendors?.edges
          ?.map((edge) => edge.node)
          .filter(
            (vendor): vendor is string =>
              typeof vendor === "string" &&
              vendor.trim().length > 0,
          ) ?? [];

      shopifyVendors = Array.from(
        new Set(
          vendorNames.map((vendor) =>
            vendor.trim(),
          ),
        ),
      )
        .sort((a, b) =>
          a.localeCompare(b),
        )
        .map((vendor) => ({
          vendor,
        }));
    }
  } catch (error) {
    shopifyError =
      error instanceof Error
        ? error.message
        : "Unable to load Shopify vendors.";
  }


  const registeredVendorNames =
    new Set(
      sellers.map((seller) =>
        seller.shopifyVendor
          .trim()
          .toLowerCase(),
      ),
    );


  const vendorsAvailableToSync =
    shopifyVendors.filter(
      ({ vendor }) =>
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
// SYNC SHOPIFY SELLER INTO HAIRGRAB CORE
// ===========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData =
    await request.formData();

  const intent =
    String(
      formData.get("intent") || "",
    );


  if (
    intent !==
    "sync-shopify-vendor"
  ) {
    return {
      success: false,
      message:
        "Unknown seller action.",
    };
  }


  const shopifyVendor =
    String(
      formData.get(
        "shopifyVendor",
      ) || "",
    ).trim();


  if (!shopifyVendor) {
    return {
      success: false,
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


    if (existingSeller) {
      return {
        success: false,
        message:
          `${shopifyVendor} is already registered as ${existingSeller.sellerCode}.`,
      };
    }


    const sellers =
      await db.seller.findMany({
        select: {
          sellerCode: true,
        },
      });


    let highestSellerNumber = 0;

    for (const seller of sellers) {
      const match =
        seller.sellerCode.match(
          /^HG-(\d+)$/,
        );

      if (!match) {
        continue;
      }

      const number =
        Number(match[1]);

      if (
        Number.isFinite(number) &&
        number > highestSellerNumber
      ) {
        highestSellerNumber =
          number;
      }
    }


    const nextSellerNumber =
      highestSellerNumber + 1;


    const sellerCode =
      `HG-${String(
        nextSellerNumber,
      ).padStart(4, "0")}`;


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
      success: true,

      message:
        `${seller.businessName} synced successfully as ${seller.sellerCode}.`,
    };
  } catch (error) {
    return {
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Unable to sync seller.",
    };
  }
};


// ===========================================================
// STYLES
// ===========================================================

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "22px",
  boxShadow:
    "0 2px 8px rgba(84, 35, 120, 0.06)",
};


const sellerLinkStyle = {
  color: "#542378",
  fontWeight: "700",
  textDecoration: "none",
};


const tableHeaderStyle = {
  padding: "12px",
  textAlign: "left" as const,
  fontSize: "12px",
  color: "#542378",
};


const tableCellStyle = {
  padding: "14px 12px",
  fontSize: "13px",
  borderBottom:
    "1px solid #eee6f2",
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
    syncFetcher.state !== "idle";


  const activeSellerCount =
    sellers.filter(
      (seller) =>
        seller.status === "ACTIVE",
    ).length;


  const payoutConnectedCount =
    sellers.filter(
      (seller) =>
        seller.payoutStatus ===
        "CONNECTED",
    ).length;


  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "28px",
        fontFamily:
          "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            color: "#7b3fa0",
            fontSize: "13px",
            fontWeight: "700",
            textTransform:
              "uppercase",
            letterSpacing: "1.5px",
            marginBottom: "6px",
          }}
        >
          HairGrab Marketplace
        </div>

        <h1
          style={{
            margin: 0,
            color: "#542378",
            fontSize: "32px",
          }}
        >
          Sellers
        </h1>

        <p
          style={{
            color: "#6f6675",
            fontSize: "15px",
            marginTop: "8px",
          }}
        >
          Sync Shopify sellers into
          HairGrab Core and manage
          marketplace status,
          commission and payouts.
        </p>
      </div>


      {/* ACTION RESULT */}

      {actionData?.message && (
        <div
          style={{
            marginBottom: "20px",
            padding: "14px 16px",
            borderRadius: "10px",

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

            fontWeight: "700",
            fontSize: "13px",
          }}
        >
          {actionData.message}
        </div>
      )}


      {/* SUMMARY */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              fontSize: "13px",
              color: "#6f6675",
            }}
          >
            Total Sellers
          </div>

          <div
            style={{
              fontSize: "30px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "8px",
            }}
          >
            {sellers.length}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "13px",
              color: "#6f6675",
            }}
          >
            Active Sellers
          </div>

          <div
            style={{
              fontSize: "30px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "8px",
            }}
          >
            {activeSellerCount}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "13px",
              color: "#6f6675",
            }}
          >
            Payout Connected
          </div>

          <div
            style={{
              fontSize: "30px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "8px",
            }}
          >
            {payoutConnectedCount}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "13px",
              color: "#6f6675",
            }}
          >
            Shopify Vendors
          </div>

          <div
            style={{
              fontSize: "30px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "8px",
            }}
          >
            {shopifyVendors.length}
          </div>
        </div>
      </div>


      {/* SHOPIFY SYNC */}

      <div
        style={{
          ...cardStyle,
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: "#542378",
                fontSize: "20px",
              }}
            >
              Sync Sellers from Shopify
            </h2>

            <p
              style={{
                margin:
                  "6px 0 0 0",
                color: "#756b7b",
                fontSize: "12px",
                lineHeight: "1.5",
              }}
            >
              HairGrab Core reads
              Shopify product vendors
              and lets you register
              existing marketplace
              sellers without entering
              them twice.
            </p>
          </div>

          <div
            style={{
              background: "#f8f1fc",
              color: "#542378",
              borderRadius: "20px",
              padding: "7px 12px",
              fontWeight: "700",
              fontSize: "12px",
            }}
          >
            {
              vendorsAvailableToSync.length
            }{" "}
            available to sync
          </div>
        </div>


        {shopifyError ? (
          <div
            style={{
              marginTop: "18px",
              padding: "14px",
              background: "#fff0f0",
              border:
                "1px solid #efc0c0",
              borderRadius: "10px",
              color: "#9a2929",
              fontSize: "12px",
            }}
          >
            Shopify vendor sync
            unavailable:{" "}
            {shopifyError}
          </div>
        ) : vendorsAvailableToSync.length ===
          0 ? (
          <div
            style={{
              marginTop: "18px",
              padding: "30px",
              background: "#fcf9fe",
              border:
                "1px dashed #d9c9e4",
              borderRadius: "10px",
              textAlign: "center",
              color: "#756b7b",
              fontSize: "12px",
            }}
          >
            {shopifyVendors.length === 0
              ? "No Shopify product vendors were found."
              : "All Shopify vendors are already registered in HairGrab Core."}
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              marginTop: "18px",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                minWidth: "650px",
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
                  ({ vendor }) => (
                    <tr key={vendor}>
                      <td
                        style={{
                          ...tableCellStyle,
                          fontWeight:
                            "700",
                        }}
                      >
                        {vendor}
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
                        Not Registered
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
                            background:
                              "#542378",
                            color:
                              "#ffffff",
                            border:
                              "none",
                            borderRadius:
                              "8px",
                            padding:
                              "9px 13px",
                            fontWeight:
                              "700",
                            fontSize:
                              "12px",
                            cursor:
                              isSyncing
                                ? "wait"
                                : "pointer",
                          }}
                        >
                          {isSyncing
                            ? "Syncing..."
                            : "Sync to HairGrab Core"}
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


      {/* SELLER REGISTRY */}

      <div style={cardStyle}>
        <h2
          style={{
            marginTop: 0,
            color: "#542378",
            fontSize: "20px",
          }}
        >
          HairGrab Seller Registry
        </h2>

        <div
          style={{
            color: "#756b7b",
            fontSize: "12px",
            marginTop: "-7px",
            marginBottom: "18px",
          }}
        >
          Sellers registered with
          HairGrab Core for commission,
          ledger and payout tracking.
        </div>


        {sellers.length === 0 ? (
          <div
            style={{
              padding: "35px",
              textAlign: "center",
              color: "#756b7b",
              background: "#fcf9fe",
              border:
                "1px dashed #d9c9e4",
              borderRadius: "10px",
            }}
          >
            No HairGrab sellers have
            been registered yet.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                minWidth: "900px",
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
                    Status
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
                    Payout Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {sellers.map(
                  (seller) => (
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
                        <Link
                          to={`/app/seller/${seller.sellerCode}`}
                          style={
                            sellerLinkStyle
                          }
                        >
                          {
                            seller.businessName
                          }
                        </Link>
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
                        {
                          seller.status
                        }
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {
                          seller.commissionRate
                        }
                        %
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {
                          seller.payoutStatus
                        }
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
          marginTop: "20px",
        }}
      >
        <Link
          to="/app"
          style={{
            color: "#542378",
            fontWeight: "700",
            textDecoration: "none",
            fontSize: "13px",
          }}
        >
          ← Back to HairGrab Core
        </Link>
      </div>
    </div>
  );
}