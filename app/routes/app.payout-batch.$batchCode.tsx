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
import { netSaleRemainingCents } from "../payout-netting.server";


export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const batchCode = params.batchCode;

  if (!batchCode) {
    throw new Response("Payout batch not found.", {
      status: 404,
    });
  }

  const batch = await db.payoutBatch.findUnique({
    where: {
      batchCode,
    },

    include: {
      seller: true,

      items: {
        include: {
          ledgerEntry: true,
        },

        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!batch) {
    throw new Response("Payout batch not found.", {
      status: 404,
    });
  }

  const refundEntries = await db.sellerLedgerEntry.findMany({
    where: {
      sellerId: batch.seller.id,
      entryType: "REFUND",
      status: "ELIGIBLE",
      shopifyOrderId: {
        in: batch.items.map(
          (item) => item.ledgerEntry.shopifyOrderId,
        ),
      },
    },
  });

  const payoutConnected =
    batch.seller.payoutStatus === "CONNECTED" &&
    Boolean(batch.seller.stripeAccountId);

  const executionAllowed =
    batch.status === "READY" &&
    payoutConnected;

  return {
    batch: {
      id: batch.id,
      batchCode: batch.batchCode,
      status: batch.status,
      currency: batch.currency,
      totalAmountCents: batch.totalAmountCents,
      createdAt: batch.createdAt.toISOString(),

      scheduledFor:
        batch.scheduledFor?.toISOString() ?? null,

      processedAt:
        batch.processedAt?.toISOString() ?? null,

      paidAt:
        batch.paidAt?.toISOString() ?? null,

      externalPayoutId:
        batch.externalPayoutId,

      failureReason:
        batch.failureReason,

      seller: {
        id: batch.seller.id,
        sellerCode: batch.seller.sellerCode,
        businessName: batch.seller.businessName,
        payoutStatus: batch.seller.payoutStatus,
        nexusSellerId: batch.seller.nexusSellerId,
        stripeAccountId: batch.seller.stripeAccountId,
      },

      items: batch.items.map((item) => {
        const entry = item.ledgerEntry;

        const remainingCents = netSaleRemainingCents(
          entry,
          refundEntries,
        );

        return {
          id: item.id,
          ledgerEntryId: item.ledgerEntryId,
          amountCents: item.amountCents,
          currency: item.currency,

          order:
            entry.shopifyOrderName ||
            entry.shopifyOrderId,

          ledgerStatus: entry.status,
          fundsStatus: entry.fundsStatus,

          sellerEarningsCents:
            entry.sellerEarningsCents,

          alreadyPaidCents:
            entry.payoutAmountCents,

          remainingCents,

          fundsClearedAt:
            entry.fundsClearedAt?.toISOString() ??
            null,

          eligibleOn:
            entry.availableOn?.toISOString() ??
            null,
        };
      }),
    },

    payoutConnected,
    executionAllowed,
  };
};


export const action = async ({
  request,
  params,
}: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const batchCode = params.batchCode;

  if (!batchCode) {
    return {
      success: false,
      message: "Payout batch was not found.",
    };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");


  // =========================================================
  // APPROVE DRAFT BATCH
  // =========================================================

  if (intent === "approve-batch") {
    try {
      const approvedBatch = await db.$transaction(
        async (tx) => {
          const batch =
            await tx.payoutBatch.findUnique({
              where: {
                batchCode,
              },

              include: {
                seller: true,

                items: {
                  include: {
                    ledgerEntry: true,
                  },
                },
              },
            });

          if (!batch) {
            throw new Error(
              "Payout batch was not found.",
            );
          }

          if (batch.status !== "DRAFT") {
            throw new Error(
              `This batch cannot be approved because its current status is ${batch.status}.`,
            );
          }

          if (batch.items.length === 0) {
            throw new Error(
              "This payout batch contains no ledger entries.",
            );
          }

          const refundEntries =
            await tx.sellerLedgerEntry.findMany({
              where: {
                sellerId: batch.sellerId,
                entryType: "REFUND",
                status: "ELIGIBLE",
                shopifyOrderId: {
                  in: batch.items.map(
                    (item) =>
                      item.ledgerEntry.shopifyOrderId,
                  ),
                },
              },
            });

          let verifiedTotalCents = 0;

          for (const item of batch.items) {
            const entry = item.ledgerEntry;

            if (entry.sellerId !== batch.sellerId) {
              throw new Error(
                "A ledger entry belongs to a different seller.",
              );
            }

            if (entry.status !== "ELIGIBLE") {
              throw new Error(
                `Order ${
                  entry.shopifyOrderName ||
                  entry.shopifyOrderId
                } is no longer ELIGIBLE.`,
              );
            }

            if (entry.fundsStatus !== "CLEARED") {
              throw new Error(
                `Order ${
                  entry.shopifyOrderName ||
                  entry.shopifyOrderId
                } no longer has cleared funds.`,
              );
            }

            const remainingCents = netSaleRemainingCents(
              entry,
              refundEntries,
            );

            if (
              item.amountCents >
              remainingCents
            ) {
              throw new Error(
                `Order ${
                  entry.shopifyOrderName ||
                  entry.shopifyOrderId
                } does not have enough unpaid seller earnings remaining.`,
              );
            }

            verifiedTotalCents +=
              item.amountCents;
          }

          if (
            verifiedTotalCents !==
            batch.totalAmountCents
          ) {
            throw new Error(
              "The payout batch total does not match its reserved ledger entries.",
            );
          }

          return tx.payoutBatch.update({
            where: {
              id: batch.id,
            },

            data: {
              status: "READY",
            },
          });
        },
      );

      return {
        success: true,
        message:
          `${approvedBatch.batchCode} approved. ` +
          "The batch is READY. No money was sent.",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to approve payout batch.",
      };
    }
  }


  // =========================================================
  // EXECUTION READINESS CHECK
  //
  // IMPORTANT:
  // THIS DOES NOT SEND MONEY.
  // =========================================================

  if (intent === "check-execution") {
    try {
      const batch =
        await db.payoutBatch.findUnique({
          where: {
            batchCode,
          },

          include: {
            seller: true,

            items: {
              include: {
                ledgerEntry: true,
              },
            },
          },
        });

      if (!batch) {
        throw new Error(
          "Payout batch was not found.",
        );
      }

      if (batch.status !== "READY") {
        throw new Error(
          `Execution blocked. Batch status must be READY. Current status: ${batch.status}.`,
        );
      }

      if (
        batch.seller.payoutStatus !==
        "CONNECTED"
      ) {
        throw new Error(
          "Execution blocked. Seller payout setup is NOT_CONNECTED.",
        );
      }

      if (!batch.seller.stripeAccountId) {
        throw new Error(
          "Execution blocked. Seller does not have a Stripe payout account ID.",
        );
      }

      if (batch.items.length === 0) {
        throw new Error(
          "Execution blocked. This batch contains no payout items.",
        );
      }

      for (const item of batch.items) {
        const entry = item.ledgerEntry;

        if (entry.status !== "ELIGIBLE") {
          throw new Error(
            `Execution blocked. Order ${
              entry.shopifyOrderName ||
              entry.shopifyOrderId
            } is no longer ELIGIBLE.`,
          );
        }

        if (entry.fundsStatus !== "CLEARED") {
          throw new Error(
            `Execution blocked. Order ${
              entry.shopifyOrderName ||
              entry.shopifyOrderId
            } no longer has CLEARED funds.`,
          );
        }
      }

      return {
        success: true,
        message:
          "Execution gate passed. This batch is structurally ready for payout execution.",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Payout execution is blocked.",
      };
    }
  }

  return {
    success: false,
    message: "Unknown payout batch action.",
  };
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

const tableHeaderStyle = {
  padding: "12px",
  textAlign: "left" as const,
  fontSize: "12px",
  color: "#542378",
};

const tableCellStyle = {
  padding: "14px 12px",
  fontSize: "12px",
  color: "#35273d",
  borderBottom:
    "1px solid #eee6f2",
};


// ===========================================================
// HELPERS
// ===========================================================

function formatMoney(
  cents: number,
  currency = "USD",
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}


// ===========================================================
// PAGE
// ===========================================================

export default function PayoutBatchPage() {
  const {
    batch,
    payoutConnected,
    executionAllowed,
  } = useLoaderData<typeof loader>();

  const actionFetcher =
    useFetcher<typeof action>();

  const actionData =
    actionFetcher.data;

  const isSubmitting =
    actionFetcher.state !== "idle";

  const isDraft =
    batch.status === "DRAFT";

  const isReady =
    batch.status === "READY";


  return (
    <div
      style={{
        maxWidth: "1150px",
        margin: "0 auto",
        padding: "28px",
        fontFamily: "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          marginBottom: "26px",
        }}
      >
        <div
          style={{
            color: "#7b3fa0",
            fontSize: "13px",
            fontWeight: "700",
            textTransform: "uppercase",
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
          Payout Batch Review
        </h1>

        <p
          style={{
            color: "#6f6675",
            fontSize: "15px",
            marginTop: "8px",
          }}
        >
          Review, approve and verify payout
          execution readiness.
        </p>
      </div>


      {/* BATCH SUMMARY */}

      <div
        style={{
          ...cardStyle,
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "15px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
              }}
            >
              Batch
            </div>

            <div
              style={{
                fontWeight: "700",
                color: "#542378",
                fontSize: "19px",
                marginTop: "4px",
              }}
            >
              {batch.batchCode}
            </div>

            <div
              style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "#756b7b",
              }}
            >
              Created{" "}
              {formatDate(
                batch.createdAt,
              )}
            </div>
          </div>

          <div
            style={{
              textAlign: "right",
            }}
          >
            <div
              style={{
                fontSize: "28px",
                fontWeight: "700",
                color: "#542378",
              }}
            >
              {formatMoney(
                batch.totalAmountCents,
                batch.currency,
              )}
            </div>

            <div
              style={{
                display: "inline-block",
                marginTop: "6px",
                padding: "6px 10px",
                borderRadius: "16px",
                background: isReady
                  ? "#eef8f0"
                  : "#f8f1fc",
                color: isReady
                  ? "#2f6b3c"
                  : "#542378",
                fontWeight: "700",
                fontSize: "11px",
              }}
            >
              {batch.status}
            </div>
          </div>
        </div>
      </div>


      {/* SELLER */}

      <div
        style={{
          ...cardStyle,
          marginBottom: "20px",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Seller
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "18px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
              }}
            >
              Business
            </div>

            <div
              style={{
                marginTop: "5px",
                fontWeight: "700",
              }}
            >
              {batch.seller.businessName}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
              }}
            >
              Seller ID
            </div>

            <div
              style={{
                marginTop: "5px",
              }}
            >
              {batch.seller.sellerCode}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
              }}
            >
              Payout Setup
            </div>

            <div
              style={{
                marginTop: "5px",
                fontWeight: "700",
                color: payoutConnected
                  ? "#2f6b3c"
                  : "#9a6716",
              }}
            >
              {batch.seller.payoutStatus}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
              }}
            >
              Nexus ID
            </div>

            <div
              style={{
                marginTop: "5px",
              }}
            >
              {batch.seller.nexusSellerId ||
                "Not assigned"}
            </div>
          </div>
        </div>
      </div>


      {/* RESERVED LEDGER ENTRIES */}

      <div
        style={{
          ...cardStyle,
          marginBottom: "20px",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Reserved Ledger Entries
        </h2>

        <div
          style={{
            fontSize: "12px",
            color: "#756b7b",
            marginBottom: "16px",
          }}
        >
          {batch.items.length}{" "}
          {batch.items.length === 1
            ? "entry"
            : "entries"}{" "}
          reserved in this payout batch.
        </div>

        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "900px",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#f8f1fc",
                }}
              >
                <th style={tableHeaderStyle}>
                  Order
                </th>

                <th style={tableHeaderStyle}>
                  Funds
                </th>

                <th style={tableHeaderStyle}>
                  Ledger
                </th>

                <th style={tableHeaderStyle}>
                  Earnings
                </th>

                <th style={tableHeaderStyle}>
                  Paid
                </th>

                <th style={tableHeaderStyle}>
                  Remaining
                </th>

                <th style={tableHeaderStyle}>
                  Batch
                </th>
              </tr>
            </thead>

            <tbody>
              {batch.items.map((item) => (
                <tr key={item.id}>
                  <td style={tableCellStyle}>
                    {item.order}
                  </td>

                  <td style={tableCellStyle}>
                    {item.fundsStatus}
                  </td>

                  <td style={tableCellStyle}>
                    {item.ledgerStatus}
                  </td>

                  <td style={tableCellStyle}>
                    {formatMoney(
                      item.sellerEarningsCents,
                      item.currency,
                    )}
                  </td>

                  <td style={tableCellStyle}>
                    {formatMoney(
                      item.alreadyPaidCents,
                      item.currency,
                    )}
                  </td>

                  <td
                    style={{
                      ...tableCellStyle,
                      fontWeight: "700",
                    }}
                  >
                    {formatMoney(
                      item.remainingCents,
                      item.currency,
                    )}
                  </td>

                  <td
                    style={{
                      ...tableCellStyle,
                      fontWeight: "700",
                      color: "#542378",
                    }}
                  >
                    {formatMoney(
                      item.amountCents,
                      item.currency,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {/* APPROVAL */}

      {isDraft && (
        <div
          style={{
            ...cardStyle,
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              color: "#542378",
              fontSize: "20px",
            }}
          >
            Batch Approval
          </h2>

          <p
            style={{
              color: "#756b7b",
              fontSize: "13px",
              lineHeight: "1.5",
            }}
          >
            Approval changes the internal
            batch status from DRAFT to READY.
            It does not send money.
          </p>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              actionFetcher.submit(
                {
                  intent:
                    "approve-batch",
                },
                {
                  method: "post",
                },
              );
            }}
            style={{
              background: "#542378",
              color: "#ffffff",
              border: "none",
              borderRadius: "9px",
              padding: "12px 18px",
              fontWeight: "700",
              cursor: isSubmitting
                ? "wait"
                : "pointer",
            }}
          >
            {isSubmitting
              ? "Approving..."
              : `Approve ${formatMoney(
                  batch.totalAmountCents,
                  batch.currency,
                )} Batch`}
          </button>
        </div>
      )}


      {/* PAYOUT EXECUTION */}

      <div style={cardStyle}>
        <h2
          style={{
            marginTop: 0,
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Payout Execution
        </h2>

        <p
          style={{
            color: "#756b7b",
            fontSize: "13px",
            lineHeight: "1.5",
          }}
        >
          HairGrab will only permit payout
          execution when the batch is READY
          and the seller has a connected
          payout account.
        </p>


        {/* EXECUTION STATUS BOXES */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
            marginTop: "18px",
          }}
        >
          <div
            style={{
              border:
                "1px solid #e5d8ef",
              borderRadius: "10px",
              padding: "14px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
              }}
            >
              Batch Status
            </div>

            <div
              style={{
                marginTop: "6px",
                fontWeight: "700",
                color: isReady
                  ? "#2f6b3c"
                  : "#9a6716",
              }}
            >
              {batch.status}
            </div>
          </div>


          <div
            style={{
              border:
                "1px solid #e5d8ef",
              borderRadius: "10px",
              padding: "14px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
              }}
            >
              Payout Account
            </div>

            <div
              style={{
                marginTop: "6px",
                fontWeight: "700",
                color: payoutConnected
                  ? "#2f6b3c"
                  : "#9a2929",
              }}
            >
              {payoutConnected
                ? "CONNECTED"
                : "NOT_CONNECTED"}
            </div>
          </div>


          <div
            style={{
              border: executionAllowed
                ? "1px solid #cbe3d0"
                : "1px solid #efc0c0",

              background:
                executionAllowed
                  ? "#eef8f0"
                  : "#fff0f0",

              borderRadius: "10px",
              padding: "14px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
              }}
            >
              Execution
            </div>

            <div
              style={{
                marginTop: "6px",
                fontWeight: "700",
                color: executionAllowed
                  ? "#2f6b3c"
                  : "#9a2929",
              }}
            >
              {executionAllowed
                ? "PERMITTED"
                : "BLOCKED"}
            </div>
          </div>
        </div>


        {/* STATIC BLOCKED NOTICE */}

        {!executionAllowed && (
          <div
            style={{
              marginTop: "18px",
              padding: "14px",
              borderRadius: "10px",
              background: "#fff9eb",
              border:
                "1px solid #eadca9",
              color: "#7a5a16",
              fontSize: "12px",
              lineHeight: "1.5",
            }}
          >
            <strong>
              Payout blocked.
            </strong>{" "}

            {batch.status !== "READY"
              ? "This batch must first reach READY status."
              : "The seller must complete payout setup before HairGrab may execute this batch."}
          </div>
        )}


        {/* CHECK BUTTON */}

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => {
            actionFetcher.submit(
              {
                intent:
                  "check-execution",
              },
              {
                method: "post",
              },
            );
          }}
          style={{
            marginTop: "18px",
            background:
              executionAllowed
                ? "#542378"
                : "#756b7b",
            color: "#ffffff",
            border: "none",
            borderRadius: "9px",
            padding: "12px 18px",
            fontWeight: "700",
            cursor: isSubmitting
              ? "wait"
              : "pointer",
          }}
        >
          {isSubmitting
            ? "Checking..."
            : "Check Execution Readiness"}
        </button>


        <div
          style={{
            marginTop: "10px",
            color: "#93899a",
            fontSize: "11px",
          }}
        >
          This button only tests HairGrab's
          payout controls. It does not send
          money.
        </div>


        {/* RESULT APPEARS HERE */}

        {actionData?.message && (
          <div
            style={{
              marginTop: "16px",
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

              fontSize: "13px",
              fontWeight: "700",
              lineHeight: "1.5",
            }}
          >
            {actionData.success
              ? "✓ "
              : "⛔ "}

            {actionData.message}

            <div
              style={{
                marginTop: "7px",
                fontSize: "11px",
                fontWeight: "400",
              }}
            >
              No payout was sent.
            </div>
          </div>
        )}
      </div>


      {/* NAVIGATION */}

      <div
        style={{
          display: "flex",
          gap: "14px",
          flexWrap: "wrap",
          marginTop: "20px",
        }}
      >
        <Link
          to="/app/payouts"
          style={{
            color: "#542378",
            fontWeight: "700",
            textDecoration: "none",
            fontSize: "13px",
          }}
        >
          ← Back to Payouts
        </Link>

        <Link
          to={`/app/seller/${batch.seller.sellerCode}`}
          style={{
            color: "#756b7b",
            fontWeight: "700",
            textDecoration: "none",
            fontSize: "13px",
          }}
        >
          View Seller
        </Link>
      </div>
    </div>
  );
}
