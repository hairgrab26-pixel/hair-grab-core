import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const entries =
    await db.sellerLedgerEntry.findMany({
      include: {
        seller: {
          select: {
            sellerCode: true,
            businessName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });


  const grossSalesCents =
    entries.reduce(
      (total, entry) =>
        total + entry.grossAmountCents,
      0,
    );


  const commissionCents =
    entries.reduce(
      (total, entry) =>
        total +
        entry.commissionAmountCents,
      0,
    );


  const sellerEarningsCents =
    entries.reduce(
      (total, entry) =>
        total +
        entry.sellerEarningsCents,
      0,
    );


  const pendingCents =
    entries
      .filter(
        (entry) =>
          entry.status === "PENDING",
      )
      .reduce(
        (total, entry) =>
          total +
          entry.sellerEarningsCents,
        0,
      );


  const eligibleCents =
    entries
      .filter(
        (entry) =>
          entry.status === "ELIGIBLE",
      )
      .reduce(
        (total, entry) =>
          total +
          entry.sellerEarningsCents,
        0,
      );


  const paidCents =
    entries.reduce(
      (total, entry) =>
        total +
        entry.payoutAmountCents,
      0,
    );


  const ledgerEntries =
    entries.map((entry) => ({
      id: entry.id,

      sellerCode:
        entry.seller.sellerCode,

      businessName:
        entry.seller.businessName,

      shopifyOrderId:
        entry.shopifyOrderId,

      shopifyOrderName:
        entry.shopifyOrderName,

      shopifyLineItemId:
        entry.shopifyLineItemId,

      entryType:
        entry.entryType,

      status:
        entry.status,

      fundsStatus:
        entry.fundsStatus,

      currency:
        entry.currency,

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
    ledgerEntries,

    totals: {
      grossSalesCents,
      commissionCents,
      sellerEarningsCents,
      pendingCents,
      eligibleCents,
      paidCents,
    },
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


const tableHeaderStyle = {
  padding: "12px",
  textAlign: "left" as const,
  fontSize: "12px",
  color: "#542378",
  fontWeight: "700",
};


const tableCellStyle = {
  padding: "14px 12px",
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
  value: string | null,
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
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(value));
}


export default function LedgerPage() {
  const {
    ledgerEntries,
    totals,
  } =
    useLoaderData<typeof loader>();


  return (
    <div
      style={{
        maxWidth: "1250px",
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
          Seller Ledger
        </h1>

        <p
          style={{
            color: "#6f6675",
            fontSize: "15px",
            marginTop: "8px",
          }}
        >
          Seller earnings, HairGrab
          commission, payout eligibility
          and payment history.
        </p>
      </div>


      {/* SUMMARY */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(175px, 1fr))",
          gap: "14px",
          marginBottom: "24px",
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              fontSize: "12px",
              color: "#756b7b",
            }}
          >
            Gross Sales
          </div>

          <div
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "7px",
            }}
          >
            {formatMoney(
              totals.grossSalesCents,
            )}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "12px",
              color: "#756b7b",
            }}
          >
            HairGrab Commission
          </div>

          <div
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "7px",
            }}
          >
            {formatMoney(
              totals.commissionCents,
            )}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "12px",
              color: "#756b7b",
            }}
          >
            Seller Earnings
          </div>

          <div
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "7px",
            }}
          >
            {formatMoney(
              totals.sellerEarningsCents,
            )}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "12px",
              color: "#756b7b",
            }}
          >
            Pending
          </div>

          <div
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "7px",
            }}
          >
            {formatMoney(
              totals.pendingCents,
            )}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "12px",
              color: "#756b7b",
            }}
          >
            Payout Ready
          </div>

          <div
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "7px",
            }}
          >
            {formatMoney(
              totals.eligibleCents,
            )}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              fontSize: "12px",
              color: "#756b7b",
            }}
          >
            Paid
          </div>

          <div
            style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#542378",
              marginTop: "7px",
            }}
          >
            {formatMoney(
              totals.paidCents,
            )}
          </div>
        </div>
      </div>


      {/* LEDGER TABLE */}

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "18px",
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
              Marketplace Ledger
            </h2>

            <div
              style={{
                color: "#756b7b",
                fontSize: "12px",
                marginTop: "5px",
              }}
            >
              Every seller sale, refund,
              adjustment and payout.
            </div>
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
            {ledgerEntries.length}{" "}
            {ledgerEntries.length === 1
              ? "Entry"
              : "Entries"}
          </div>
        </div>


        {ledgerEntries.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              border:
                "1px dashed #d9c9e4",
              borderRadius: "10px",
              background: "#fcf9fe",
              color: "#756b7b",
            }}
          >
            No HairGrab ledger
            activity yet.
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
                minWidth: "1150px",
                borderCollapse:
                  "collapse",
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
                    Date
                  </th>

                  <th style={tableHeaderStyle}>
                    Order
                  </th>

                  <th style={tableHeaderStyle}>
                    Seller
                  </th>

                  <th style={tableHeaderStyle}>
                    Type
                  </th>

                  <th style={tableHeaderStyle}>
                    Status
                  </th>

                  <th style={tableHeaderStyle}>
                    Funds
                  </th>

                  <th style={tableHeaderStyle}>
                    Gross
                  </th>

                  <th style={tableHeaderStyle}>
                    Rate
                  </th>

                  <th style={tableHeaderStyle}>
                    HairGrab
                  </th>

                  <th style={tableHeaderStyle}>
                    Seller
                  </th>

                  <th style={tableHeaderStyle}>
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
                        <Link
                          to={`/app/seller/${entry.sellerCode}`}
                          style={{
                            color:
                              "#542378",
                            fontWeight:
                              "700",
                            textDecoration:
                              "none",
                          }}
                        >
                          {
                            entry.businessName
                          }
                        </Link>

                        <div
                          style={{
                            color:
                              "#93899a",
                            fontSize:
                              "10px",
                            marginTop:
                              "3px",
                          }}
                        >
                          {entry.sellerCode}
                        </div>
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
                        {entry.fundsStatus}
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
                        {
                          entry.commissionRate
                        }
                        %
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
                        style={{
                          ...tableCellStyle,
                          fontWeight: "700",
                        }}
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