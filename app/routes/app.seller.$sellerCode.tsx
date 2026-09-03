import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  useFetcher,
  useLoaderData,
} from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";


export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  if (!params.sellerCode) {
    throw new Response("Seller code missing", {
      status: 400,
    });
  }

  const seller = await db.seller.findUnique({
    where: {
      sellerCode: params.sellerCode,
    },
    include: {
      ledgerEntries: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!seller) {
    throw new Response("Seller not found", {
      status: 404,
    });
  }

  const saleEntries = seller.ledgerEntries.filter(
    (entry) => entry.entryType === "SALE",
  );

  const grossSalesCents = saleEntries.reduce(
    (total, entry) =>
      total + entry.grossAmountCents,
    0,
  );

  const commissionCents =
    seller.ledgerEntries.reduce(
      (total, entry) =>
        total + entry.commissionAmountCents,
      0,
    );

  const sellerEarningsCents =
    seller.ledgerEntries.reduce(
      (total, entry) =>
        total + entry.sellerEarningsCents,
      0,
    );

  const refundsCents =
    seller.ledgerEntries.reduce(
      (total, entry) =>
        total + entry.refundAmountCents,
      0,
    );

  const paidToSellerCents =
    seller.ledgerEntries.reduce(
      (total, entry) =>
        total + entry.payoutAmountCents,
      0,
    );

  const payoutReadyCents =
    seller.ledgerEntries
      .filter(
        (entry) => entry.status === "ELIGIBLE",
      )
      .reduce(
        (total, entry) =>
          total + entry.sellerEarningsCents,
        0,
      );

  const ledgerEntries =
    seller.ledgerEntries.map((entry) => ({
      id: entry.id,
      shopifyOrderId: entry.shopifyOrderId,
      shopifyOrderName: entry.shopifyOrderName,
      shopifyLineItemId:
        entry.shopifyLineItemId,

      entryType: entry.entryType,
      status: entry.status,
      currency: entry.currency,

      commissionRate:
        entry.commissionRate,

      grossAmountCents:
        entry.grossAmountCents,

      commissionAmountCents:
        entry.commissionAmountCents,

      sellerEarningsCents:
        entry.sellerEarningsCents,

      refundAmountCents:
        entry.refundAmountCents,

      payoutAmountCents:
        entry.payoutAmountCents,

      description: entry.description,

      availableOn:
        entry.availableOn?.toISOString() ??
        null,

      paidAt:
        entry.paidAt?.toISOString() ??
        null,

      shopifyCreatedAt:
        entry.shopifyCreatedAt?.toISOString() ??
        null,

      createdAt:
        entry.createdAt.toISOString(),
    }));

  return {
    seller: {
      id: seller.id,
      sellerCode: seller.sellerCode,
      businessName: seller.businessName,
      shopifyVendor: seller.shopifyVendor,
      nexusSellerId: seller.nexusSellerId,
      status: seller.status,
      commissionRate:
        seller.commissionRate,
      stripeAccountId:
        seller.stripeAccountId,
      payoutStatus:
        seller.payoutStatus,
    },

    financials: {
      grossSalesCents,
      commissionCents,
      sellerEarningsCents,
      refundsCents,
      paidToSellerCents,
      payoutReadyCents,
    },

    ledgerEntries,
  };
};


export const action = async ({
  request,
  params,
}: ActionFunctionArgs) => {
  await authenticate.admin(request);

  if (!params.sellerCode) {
    return {
      success: false,
      message:
        "Seller code is missing.",
    };
  }

  const formData =
    await request.formData();

  const status = String(
    formData.get("status") || "ACTIVE",
  );

  const commissionRate = Number(
    formData.get("commissionRate") || 0,
  );

  const nexusSellerIdRaw = String(
    formData.get("nexusSellerId") || "",
  ).trim();

  const payoutStatus = String(
    formData.get("payoutStatus") ||
      "NOT_CONNECTED",
  );

  const allowedStatuses = [
    "ACTIVE",
    "SUSPENDED",
    "INACTIVE",
  ];

  const allowedPayoutStatuses = [
    "NOT_CONNECTED",
    "PENDING",
    "CONNECTED",
    "RESTRICTED",
  ];

  if (
    !allowedStatuses.includes(status)
  ) {
    return {
      success: false,
      message:
        "Invalid seller status.",
    };
  }

  if (
    !allowedPayoutStatuses.includes(
      payoutStatus,
    )
  ) {
    return {
      success: false,
      message:
        "Invalid payout status.",
    };
  }

  if (
    Number.isNaN(commissionRate) ||
    commissionRate < 0 ||
    commissionRate > 100
  ) {
    return {
      success: false,
      message:
        "Commission rate must be between 0 and 100.",
    };
  }

  await db.seller.update({
    where: {
      sellerCode: params.sellerCode,
    },

    data: {
      status,
      commissionRate,

      nexusSellerId:
        nexusSellerIdRaw.length > 0
          ? nexusSellerIdRaw
          : null,

      payoutStatus,
    },
  });

  return {
    success: true,
    message:
      "Seller changes saved.",
  };
};


const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "22px",
  boxShadow:
    "0 2px 8px rgba(84, 35, 120, 0.06)",
};


const labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "#756b7b",
  marginBottom: "5px",
  fontWeight: "700",
};


const valueStyle = {
  fontSize: "15px",
  fontWeight: "700",
  color: "#2b1b35",
};


const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #d9c9e4",
  borderRadius: "8px",
  padding: "10px 12px",
  fontSize: "14px",
  background: "#ffffff",
  color: "#21152a",
};


const moneyStyle = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#542378",
  marginTop: "5px",
};


const tableHeaderStyle = {
  padding: "12px",
  textAlign: "left" as const,
  fontSize: "12px",
  color: "#542378",
};


const tableCellStyle = {
  padding: "13px 12px",
  fontSize: "12px",
  color: "#35273d",
  borderBottom:
    "1px solid #eee6f2",
};


function formatMoney(
  cents: number,
  currency = "USD",
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency,
    },
  ).format(cents / 100);
}


function formatDate(
  dateString: string | null,
) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString);

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ).format(date);
}


export default function SellerDetailPage() {
  const {
    seller,
    financials,
    ledgerEntries,
  } =
    useLoaderData<typeof loader>();

  const fetcher =
    useFetcher<typeof action>();

  const isSaving =
    fetcher.state === "submitting";


  const saveSeller = () => {
    const formData = new FormData();

    const nexusSellerId =
      document.querySelector(
        'input[name="nexusSellerId"]',
      ) as HTMLInputElement | null;

    const status =
      document.querySelector(
        'select[name="status"]',
      ) as HTMLSelectElement | null;

    const commissionRate =
      document.querySelector(
        'input[name="commissionRate"]',
      ) as HTMLInputElement | null;

    const payoutStatus =
      document.querySelector(
        'select[name="payoutStatus"]',
      ) as HTMLSelectElement | null;

    formData.set(
      "nexusSellerId",
      nexusSellerId?.value || "",
    );

    formData.set(
      "status",
      status?.value || "ACTIVE",
    );

    formData.set(
      "commissionRate",
      commissionRate?.value || "0",
    );

    formData.set(
      "payoutStatus",
      payoutStatus?.value ||
        "NOT_CONNECTED",
    );

    fetcher.submit(formData, {
      method: "POST",
    });
  };


  return (
    <div
      style={{
        maxWidth: "1150px",
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
          HairGrab Seller
        </div>

        <h1
          style={{
            margin: "0",
            color: "#542378",
            fontSize: "32px",
          }}
        >
          {seller.businessName}
        </h1>

        <p
          style={{
            color: "#6f6675",
            fontSize: "15px",
            marginTop: "8px",
          }}
        >
          Seller profile, commission,
          payout and marketplace status.
        </p>
      </div>


      {/* SAVE MESSAGE */}

      {fetcher.data?.message && (
        <div
          style={{
            marginBottom: "18px",
            padding: "12px 16px",
            borderRadius: "10px",

            background:
              fetcher.data.success
                ? "#f2faf4"
                : "#fff4f4",

            border:
              fetcher.data.success
                ? "1px solid #b9dfc1"
                : "1px solid #efc0c0",

            color:
              fetcher.data.success
                ? "#276738"
                : "#9a2929",

            fontWeight: "700",
            fontSize: "13px",
          }}
        >
          {fetcher.data.message}
        </div>
      )}


      {/* SELLER SUMMARY */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={cardStyle}>
          <div style={labelStyle}>
            Seller ID
          </div>

          <div style={valueStyle}>
            {seller.sellerCode}
          </div>
        </div>


        <div style={cardStyle}>
          <div style={labelStyle}>
            Status
          </div>

          <div style={valueStyle}>
            {seller.status}
          </div>
        </div>


        <div style={cardStyle}>
          <div style={labelStyle}>
            Commission Rate
          </div>

          <div style={valueStyle}>
            {seller.commissionRate}%
          </div>
        </div>


        <div style={cardStyle}>
          <div style={labelStyle}>
            Payout Status
          </div>

          <div style={valueStyle}>
            {seller.payoutStatus}
          </div>
        </div>
      </div>


      {/* SELLER SETTINGS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "18px",
        }}
      >
        <div style={cardStyle}>
          <h2
            style={{
              marginTop: 0,
              color: "#542378",
              fontSize: "20px",
            }}
          >
            Seller Information
          </h2>

          <div
            style={{
              display: "grid",
              gap: "18px",
              marginTop: "18px",
            }}
          >
            <div>
              <div style={labelStyle}>
                Business Name
              </div>

              <div style={valueStyle}>
                {seller.businessName}
              </div>
            </div>


            <div>
              <div style={labelStyle}>
                Shopify Vendor
              </div>

              <div style={valueStyle}>
                {seller.shopifyVendor}
              </div>
            </div>


            <div>
              <label
                style={labelStyle}
              >
                Nexus Seller ID
              </label>

              <input
                type="text"
                name="nexusSellerId"
                defaultValue={
                  seller.nexusSellerId ||
                  ""
                }
                placeholder="Enter Nexus Seller ID"
                style={inputStyle}
              />
            </div>


            <div>
              <label
                style={labelStyle}
              >
                Marketplace Status
              </label>

              <select
                name="status"
                defaultValue={
                  seller.status
                }
                style={inputStyle}
              >
                <option value="ACTIVE">
                  ACTIVE
                </option>

                <option value="SUSPENDED">
                  SUSPENDED
                </option>

                <option value="INACTIVE">
                  INACTIVE
                </option>
              </select>
            </div>


            <div>
              <label
                style={labelStyle}
              >
                Commission Rate %
              </label>

              <input
                type="number"
                name="commissionRate"
                min="0"
                max="100"
                step="0.01"
                defaultValue={
                  seller.commissionRate
                }
                style={inputStyle}
              />
            </div>
          </div>
        </div>


        {/* PAYOUT SETUP */}

        <div style={cardStyle}>
          <h2
            style={{
              marginTop: 0,
              color: "#542378",
              fontSize: "20px",
            }}
          >
            Payout Setup
          </h2>

          <div
            style={{
              display: "grid",
              gap: "18px",
              marginTop: "18px",
            }}
          >
            <div>
              <label
                style={labelStyle}
              >
                Payout Status
              </label>

              <select
                name="payoutStatus"
                defaultValue={
                  seller.payoutStatus
                }
                style={inputStyle}
              >
                <option value="NOT_CONNECTED">
                  NOT_CONNECTED
                </option>

                <option value="PENDING">
                  PENDING
                </option>

                <option value="CONNECTED">
                  CONNECTED
                </option>

                <option value="RESTRICTED">
                  RESTRICTED
                </option>
              </select>
            </div>


            <div>
              <div style={labelStyle}>
                Stripe Connected Account
              </div>

              <div style={valueStyle}>
                {seller.stripeAccountId ||
                  "Not connected"}
              </div>
            </div>


            <div
              style={{
                padding: "14px",
                background: "#f8f1fc",
                borderRadius: "10px",
                fontSize: "12px",
                color: "#6f6675",
                lineHeight: "1.5",
              }}
            >
              Stripe account information
              will eventually be populated
              automatically through
              HairGrab seller payout
              onboarding.
            </div>
          </div>
        </div>
      </div>


      {/* SAVE BUTTON */}

      <div
        style={{
          marginTop: "18px",
          display: "flex",
          justifyContent:
            "flex-end",
        }}
      >
        <button
          type="button"
          onClick={saveSeller}
          disabled={isSaving}
          style={{
            background: "#542378",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "12px 22px",
            fontWeight: "700",
            cursor: isSaving
              ? "default"
              : "pointer",
            opacity:
              isSaving ? 0.6 : 1,
          }}
        >
          {isSaving
            ? "Saving..."
            : "Save Seller Changes"}
        </button>
      </div>


      {/* LIVE FINANCIAL SUMMARY */}

      <div
        style={{
          ...cardStyle,
          marginTop: "24px",
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
              Seller Financial Summary
            </h2>

            <div
              style={{
                color: "#756b7b",
                fontSize: "12px",
                marginTop: "5px",
              }}
            >
              Live totals from the
              HairGrab seller ledger.
            </div>
          </div>

          <div
            style={{
              background: "#f8f1fc",
              color: "#542378",
              borderRadius: "20px",
              padding: "7px 12px",
              fontSize: "12px",
              fontWeight: "700",
            }}
          >
            {ledgerEntries.length} Ledger{" "}
            {ledgerEntries.length === 1
              ? "Entry"
              : "Entries"}
          </div>
        </div>


        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "16px",
            marginTop: "22px",
          }}
        >
          <div>
            <div style={labelStyle}>
              Gross Sales
            </div>

            <div style={moneyStyle}>
              {formatMoney(
                financials.grossSalesCents,
              )}
            </div>
          </div>


          <div>
            <div style={labelStyle}>
              HairGrab Commission
            </div>

            <div style={moneyStyle}>
              {formatMoney(
                financials.commissionCents,
              )}
            </div>
          </div>


          <div>
            <div style={labelStyle}>
              Seller Earnings
            </div>

            <div style={moneyStyle}>
              {formatMoney(
                financials.sellerEarningsCents,
              )}
            </div>
          </div>


          <div>
            <div style={labelStyle}>
              Refunds
            </div>

            <div style={moneyStyle}>
              {formatMoney(
                financials.refundsCents,
              )}
            </div>
          </div>


          <div>
            <div style={labelStyle}>
              Paid to Seller
            </div>

            <div style={moneyStyle}>
              {formatMoney(
                financials.paidToSellerCents,
              )}
            </div>
          </div>


          <div>
            <div style={labelStyle}>
              Payout Ready
            </div>

            <div style={moneyStyle}>
              {formatMoney(
                financials.payoutReadyCents,
              )}
            </div>
          </div>
        </div>
      </div>


      {/* SELLER LEDGER */}

      <div
        style={{
          ...cardStyle,
          marginTop: "18px",
          marginBottom: "40px",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: "5px",
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Seller Ledger
        </h2>

        <div
          style={{
            color: "#756b7b",
            fontSize: "12px",
            marginBottom: "18px",
          }}
        >
          Sales, refunds, adjustments
          and payouts recorded for{" "}
          {seller.businessName}.
        </div>


        {ledgerEntries.length === 0 ? (
          <div
            style={{
              padding: "38px 20px",
              textAlign: "center",
              border:
                "1px dashed #d9c9e4",
              borderRadius: "10px",
              background: "#fcf9fe",
            }}
          >
            <div
              style={{
                color: "#542378",
                fontWeight: "700",
                fontSize: "15px",
                marginBottom: "7px",
              }}
            >
              No ledger activity yet
            </div>

            <div
              style={{
                color: "#756b7b",
                fontSize: "12px",
                lineHeight: "1.5",
              }}
            >
              Marketplace sales,
              refunds and payouts for
              this seller will appear
              here automatically.
            </div>
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
                minWidth: "950px",
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
                    Date
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Order
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Type
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
                    Gross
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    HairGrab
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Seller
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Refund
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Payout
                  </th>
                </tr>
              </thead>


              <tbody>
                {ledgerEntries.map(
                  (entry) => (
                    <tr key={entry.id}>
                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {formatDate(
                          entry.shopifyCreatedAt ||
                            entry.createdAt,
                        )}
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {entry.shopifyOrderName ||
                          entry.shopifyOrderId}
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {entry.entryType}
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {entry.status}
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {formatMoney(
                          entry.grossAmountCents,
                          entry.currency,
                        )}
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {formatMoney(
                          entry.commissionAmountCents,
                          entry.currency,
                        )}
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {formatMoney(
                          entry.sellerEarningsCents,
                          entry.currency,
                        )}
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {formatMoney(
                          entry.refundAmountCents,
                          entry.currency,
                        )}
                      </td>

                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {formatMoney(
                          entry.payoutAmountCents,
                          entry.currency,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}