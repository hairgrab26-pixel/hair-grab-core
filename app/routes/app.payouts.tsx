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
}: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // =========================================================
  // UNBATCHED ELIGIBLE SELLER EARNINGS
  // =========================================================

  const sellers = await db.seller.findMany({
    where: {
      ledgerEntries: {
        some: {
          status: "ELIGIBLE",
          processingFeeStatus: "FINALIZED",
          payoutBatchItem: null,
        },
      },
    },

    include: {
      ledgerEntries: {
        where: {
          status: "ELIGIBLE",
          payoutBatchItem: null,
        },

        orderBy: {
          createdAt: "asc",
        },
      },
    },

    orderBy: {
      businessName: "asc",
    },
  });


  const payoutSellers = sellers
    .map((seller) => {
      const refundEntries = seller.ledgerEntries.filter(
        (entry) => entry.entryType === "REFUND",
      );
      const entries = seller.ledgerEntries
        .filter((entry) => entry.entryType === "SALE")
        .filter((entry) => entry.processingFeeStatus === "FINALIZED")
        .map((entry) => {
          const remainingCents = netSaleRemainingCents(
            entry,
            refundEntries,
          );

          return {
            id: entry.id,

            shopifyOrderId:
              entry.shopifyOrderId,

            shopifyOrderName:
              entry.shopifyOrderName,

            sellerEarningsCents:
              entry.sellerEarningsCents,

            payoutAmountCents:
              entry.payoutAmountCents,

            remainingCents,

            currency:
              entry.currency,

            status:
              entry.status,

            fundsStatus:
              entry.fundsStatus,

            fundsClearedAt:
              entry.fundsClearedAt
                ?.toISOString() ?? null,

            availableOn:
              entry.availableOn
                ?.toISOString() ?? null,

            eligibilityCheckedAt:
              entry.eligibilityCheckedAt
                ?.toISOString() ?? null,

            createdAt:
              entry.createdAt.toISOString(),
          };
        })

        .filter(
          (entry) =>
            entry.remainingCents > 0,
        );


      const payoutReadyCents =
        entries.reduce(
          (total, entry) =>
            total +
            entry.remainingCents,
          0,
        );


      return {
        id:
          seller.id,

        sellerCode:
          seller.sellerCode,

        businessName:
          seller.businessName,

        payoutStatus:
          seller.payoutStatus,

        nexusSellerId:
          seller.nexusSellerId,

        stripeAccountId:
          seller.stripeAccountId,

        payoutReadyCents,

        eligibleEntryCount:
          entries.length,

        entries,
      };
    })

    .filter(
      (seller) =>
        seller.payoutReadyCents > 0,
    );


  // =========================================================
  // DRAFT + READY PAYOUT BATCHES
  // =========================================================

  const batches =
    await db.payoutBatch.findMany({
      where: {
        status: {
          in: [
            "DRAFT",
            "READY",
          ],
        },
      },

      include: {
        seller: true,

        items: {
          include: {
            ledgerEntry: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });


  const mappedBatches =
    batches.map((batch) => ({
      id:
        batch.id,

      batchCode:
        batch.batchCode,

      status:
        batch.status,

      totalAmountCents:
        batch.totalAmountCents,

      currency:
        batch.currency,

      createdAt:
        batch.createdAt.toISOString(),

      scheduledFor:
        batch.scheduledFor
          ?.toISOString() ?? null,

      processedAt:
        batch.processedAt
          ?.toISOString() ?? null,

      seller: {
        sellerCode:
          batch.seller.sellerCode,

        businessName:
          batch.seller.businessName,

        payoutStatus:
          batch.seller.payoutStatus,

        nexusSellerId:
          batch.seller.nexusSellerId,

        stripeAccountId:
          batch.seller.stripeAccountId,
      },

      items:
        batch.items.map((item) => ({
          id:
            item.id,

          amountCents:
            item.amountCents,

          currency:
            item.currency,

          order:
            item.ledgerEntry
              .shopifyOrderName ||
            item.ledgerEntry
              .shopifyOrderId,
        })),
    }));


  const draftBatches =
    mappedBatches.filter(
      (batch) =>
        batch.status === "DRAFT",
    );


  const readyBatches =
    mappedBatches.filter(
      (batch) =>
        batch.status === "READY",
    );


  // =========================================================
  // SUMMARY TOTALS
  // =========================================================

  const totalPayoutReadyCents =
    payoutSellers.reduce(
      (total, seller) =>
        total +
        seller.payoutReadyCents,
      0,
    );


  const payoutConnectedCount =
    payoutSellers.filter(
      (seller) =>
        seller.payoutStatus ===
        "CONNECTED",
    ).length;


  const draftBatchTotalCents =
    draftBatches.reduce(
      (total, batch) =>
        total +
        batch.totalAmountCents,
      0,
    );


  const readyBatchTotalCents =
    readyBatches.reduce(
      (total, batch) =>
        total +
        batch.totalAmountCents,
      0,
    );


  return {
    payoutSellers,
    draftBatches,
    readyBatches,

    totals: {
      sellersReady:
        payoutSellers.length,

      payoutConnectedCount,

      payoutReadyCents:
        totalPayoutReadyCents,

      draftBatchCount:
        draftBatches.length,

      draftBatchTotalCents,

      readyBatchCount:
        readyBatches.length,

      readyBatchTotalCents,
    },
  };
};


// ===========================================================
// CREATE DRAFT PAYOUT BATCH
// ===========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData =
    await request.formData();

  const intent =
    formData.get("intent");


  if (
    intent !==
    "create-draft-batch"
  ) {
    return {
      success: false,
      message:
        "Unknown payout action.",
    };
  }


  const sellerId =
    String(
      formData.get("sellerId") ||
        "",
    );


  if (!sellerId) {
    return {
      success: false,
      message:
        "Seller was not provided.",
    };
  }


  try {
    const createdBatch =
      await db.$transaction(
        async (tx) => {
          const seller =
            await tx.seller.findUnique({
              where: {
                id: sellerId,
              },

              include: {
                ledgerEntries: {
                  where: {
                    status:
                      "ELIGIBLE",

                    payoutBatchItem:
                      null,
                  },

                  orderBy: {
                    createdAt:
                      "asc",
                  },
                },
              },
            });


          if (!seller) {
            throw new Error(
              "Seller not found.",
            );
          }


          const refundEntries = seller.ledgerEntries.filter(
            (entry) => entry.entryType === "REFUND",
          );
          const entries =
            seller.ledgerEntries
              .filter((entry) => entry.entryType === "SALE")
              .filter((entry) => entry.processingFeeStatus === "FINALIZED")
              .map((entry) => ({
                ...entry,

                remainingCents: netSaleRemainingCents(
                  entry,
                  refundEntries,
                ),
              }))

              .filter(
                (entry) =>
                  entry.remainingCents >
                  0,
              );


          if (
            entries.length === 0
          ) {
            throw new Error(
              "No unbatched eligible earnings remain for this seller.",
            );
          }


          const currencies =
            new Set(
              entries.map(
                (entry) =>
                  entry.currency,
              ),
            );


          if (
            currencies.size !== 1
          ) {
            throw new Error(
              "A payout batch cannot mix currencies.",
            );
          }


          const currency =
            entries[0].currency;


          const totalAmountCents =
            entries.reduce(
              (total, entry) =>
                total +
                entry.remainingCents,

              0,
            );


          const batchCode =
            `HG-PAYOUT-${Date.now()}-${seller.sellerCode}`;


          return tx.payoutBatch.create({
            data: {
              batchCode,

              sellerId:
                seller.id,

              status:
                "DRAFT",

              currency,

              totalAmountCents,

              items: {
                create:
                  entries.map(
                    (entry) => ({
                      amountCents:
                        entry
                          .remainingCents,

                      currency:
                        entry.currency,

                      ledgerEntry: {
                        connect: {
                          id:
                            entry.id,
                        },
                      },
                    }),
                  ),
              },
            },
          });
        },
      );


    return {
      success: true,

      message:
        `${createdBatch.batchCode} created as a DRAFT payout batch. No money was sent.`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create payout batch.";


    return {
      success: false,
      message,
    };
  }
};


// ===========================================================
// STYLES
// ===========================================================

const cardStyle = {
  background: "#ffffff",

  border:
    "1px solid #e5d8ef",

  borderRadius:
    "14px",

  padding:
    "22px",

  boxShadow:
    "0 2px 8px rgba(84, 35, 120, 0.06)",
};


const labelStyle = {
  fontSize:
    "12px",

  color:
    "#756b7b",

  marginBottom:
    "5px",
};


const numberStyle = {
  fontSize:
    "28px",

  fontWeight:
    "700",

  color:
    "#542378",

  marginTop:
    "7px",
};


const tableHeaderStyle = {
  padding:
    "12px",

  textAlign:
    "left" as const,

  fontSize:
    "12px",

  color:
    "#542378",
};


const tableCellStyle = {
  padding:
    "14px 12px",

  fontSize:
    "12px",

  color:
    "#35273d",

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
  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency,
    },
  ).format(
    cents / 100,
  );
}


function formatDate(
  dateString:
    string | null,
) {
  if (!dateString) {
    return "—";
  }


  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",
    },
  ).format(
    new Date(dateString),
  );
}


function getFundsStatusLabel(
  status: string,
) {
  if (
    status === "CLEARED"
  ) {
    return "Cleared";
  }


  if (
    status === "FAILED"
  ) {
    return "Failed";
  }


  return "Awaiting clearance";
}


function getFundsStatusStyle(
  status: string,
) {
  if (
    status === "CLEARED"
  ) {
    return {
      background:
        "#eef8f0",

      color:
        "#2f6b3c",

      border:
        "1px solid #cbe3d0",
    };
  }


  if (
    status === "FAILED"
  ) {
    return {
      background:
        "#fff0f0",

      color:
        "#9a2929",

      border:
        "1px solid #efc0c0",
    };
  }


  return {
    background:
      "#fff9eb",

    color:
      "#7a5a16",

    border:
      "1px solid #eadca9",
  };
}


// ===========================================================
// PAGE
// ===========================================================

export default function PayoutsPage() {
  const {
    payoutSellers,
    draftBatches,
    readyBatches,
    totals,
  } =
    useLoaderData<
      typeof loader
    >();


  const batchFetcher =
    useFetcher<
      typeof action
    >();


  const actionData =
    batchFetcher.data;


  const isSubmitting =
    batchFetcher.state !==
    "idle";


  return (
    <div
      style={{
        maxWidth:
          "1200px",

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
      {/* ===============================================
          HEADER
      =============================================== */}

      <div
        style={{
          marginBottom:
            "26px",
        }}
      >
        <div
          style={{
            color:
              "#7b3fa0",

            fontSize:
              "13px",

            fontWeight:
              "700",

            textTransform:
              "uppercase",

            letterSpacing:
              "1.5px",

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
          Payouts
        </h1>


        <p
          style={{
            color:
              "#6f6675",

            marginTop:
              "8px",

            fontSize:
              "15px",
          }}
        >
          Review seller earnings,
          draft payout batches and
          approved batches waiting
          for payout execution.
        </p>
      </div>


      {/* ===============================================
          ACTION MESSAGE
      =============================================== */}

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

            color:
              actionData.success
                ? "#2f6b3c"
                : "#9a2929",

            border:
              actionData.success
                ? "1px solid #cbe3d0"
                : "1px solid #efc0c0",

            fontSize:
              "13px",

            fontWeight:
              "700",
          }}
        >
          {actionData.message}
        </div>
      )}


      {/* ===============================================
          SUMMARY
      =============================================== */}

      <div
        style={{
          display:
            "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",

          gap:
            "16px",

          marginBottom:
            "24px",
        }}
      >
        <div
          style={cardStyle}
        >
          <div
            style={labelStyle}
          >
            Unbatched Sellers
          </div>

          <div
            style={numberStyle}
          >
            {
              totals.sellersReady
            }
          </div>

          <div
            style={{
              fontSize:
                "12px",

              color:
                "#93899a",

              marginTop:
                "4px",
            }}
          >
            Eligible and not yet
            assigned
          </div>
        </div>


        <div
          style={cardStyle}
        >
          <div
            style={labelStyle}
          >
            Unbatched Ready
          </div>

          <div
            style={numberStyle}
          >
            {formatMoney(
              totals
                .payoutReadyCents,
            )}
          </div>

          <div
            style={{
              fontSize:
                "12px",

              color:
                "#93899a",

              marginTop:
                "4px",
            }}
          >
            Available to batch
          </div>
        </div>


        <div
          style={cardStyle}
        >
          <div
            style={labelStyle}
          >
            Draft Batches
          </div>

          <div
            style={numberStyle}
          >
            {
              totals
                .draftBatchCount
            }
          </div>

          <div
            style={{
              fontSize:
                "12px",

              color:
                "#93899a",

              marginTop:
                "4px",
            }}
          >
            {formatMoney(
              totals
                .draftBatchTotalCents,
            )}{" "}
            staged
          </div>
        </div>


        <div
          style={cardStyle}
        >
          <div
            style={labelStyle}
          >
            Ready Batches
          </div>

          <div
            style={numberStyle}
          >
            {
              totals
                .readyBatchCount
            }
          </div>

          <div
            style={{
              fontSize:
                "12px",

              color:
                "#93899a",

              marginTop:
                "4px",
            }}
          >
            {formatMoney(
              totals
                .readyBatchTotalCents,
            )}{" "}
            approved
          </div>
        </div>
      </div>


      {/* ===============================================
          SAFETY NOTICE
      =============================================== */}

      <div
        style={{
          background:
            "#f8f1fc",

          border:
            "1px solid #e5d8ef",

          borderRadius:
            "12px",

          padding:
            "16px",

          marginBottom:
            "24px",

          color:
            "#5c4668",

          fontSize:
            "13px",

          lineHeight:
            "1.5",
        }}
      >
        <strong>
          HairGrab payout control:
        </strong>{" "}

        READY means the batch has
        passed HairGrab's internal
        review.

        It does not mean the seller
        has been paid.

        Actual payout execution must
        remain blocked until the
        seller has a connected payout
        account.
      </div>


      {/* ===============================================
          READY PAYOUT BATCHES
      =============================================== */}

      <div
        style={{
          ...cardStyle,

          marginBottom:
            "24px",
        }}
      >
        <h2
          style={{
            marginTop:
              0,

            marginBottom:
              "5px",

            color:
              "#542378",

            fontSize:
              "20px",
          }}
        >
          Ready Payout Batches
        </h2>


        <div
          style={{
            color:
              "#756b7b",

            fontSize:
              "12px",

            marginBottom:
              "18px",
          }}
        >
          Approved HairGrab batches
          awaiting the future payout
          execution step.
        </div>


        {readyBatches.length ===
        0 ? (
          <div
            style={{
              padding:
                "34px 20px",

              textAlign:
                "center",

              border:
                "1px dashed #d9c9e4",

              borderRadius:
                "10px",

              background:
                "#fcf9fe",
            }}
          >
            <div
              style={{
                color:
                  "#542378",

                fontWeight:
                  "700",

                marginBottom:
                  "6px",
              }}
            >
              No approved payout
              batches
            </div>

            <div
              style={{
                color:
                  "#756b7b",

                fontSize:
                  "12px",
              }}
            >
              Approved batches will
              appear here after moving
              from DRAFT to READY.
            </div>
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
                  "900px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      "#eef8f0",
                  }}
                >
                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Batch
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
                    Seller ID
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Amount
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Payout Setup
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Nexus ID
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
                    Review
                  </th>
                </tr>
              </thead>


              <tbody>
                {readyBatches.map(
                  (batch) => (
                    <tr
                      key={
                        batch.id
                      }
                    >
                      <td
                        style={{
                          ...tableCellStyle,

                          fontWeight:
                            "700",

                          color:
                            "#542378",
                        }}
                      >
                        {
                          batch.batchCode
                        }
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {
                          batch.seller
                            .businessName
                        }
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {
                          batch.seller
                            .sellerCode
                        }
                      </td>


                      <td
                        style={{
                          ...tableCellStyle,

                          fontWeight:
                            "700",
                        }}
                      >
                        {formatMoney(
                          batch
                            .totalAmountCents,

                          batch
                            .currency,
                        )}
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {
                          batch.seller
                            .payoutStatus
                        }
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {batch.seller
                          .nexusSellerId ||
                          "Not assigned"}
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        <span
                          style={{
                            display:
                              "inline-block",

                            background:
                              "#eef8f0",

                            border:
                              "1px solid #cbe3d0",

                            color:
                              "#2f6b3c",

                            borderRadius:
                              "15px",

                            padding:
                              "5px 9px",

                            fontSize:
                              "11px",

                            fontWeight:
                              "700",
                          }}
                        >
                          READY
                        </span>
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        <Link
                          to={`/app/payout-batch/${batch.batchCode}`}
                          style={{
                            color:
                              "#542378",

                            fontWeight:
                              "700",

                            textDecoration:
                              "none",
                          }}
                        >
                          View Batch
                        </Link>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* ===============================================
          READY TO CREATE DRAFT
      =============================================== */}

      <div
        style={cardStyle}
      >
        <h2
          style={{
            marginTop:
              0,

            marginBottom:
              "5px",

            color:
              "#542378",

            fontSize:
              "20px",
          }}
        >
          Ready to Batch
        </h2>


        <div
          style={{
            color:
              "#756b7b",

            fontSize:
              "12px",

            marginBottom:
              "18px",
          }}
        >
          Only ELIGIBLE ledger entries
          that are not already assigned
          to a payout batch appear here.
        </div>


        {payoutSellers.length ===
        0 ? (
          <div
            style={{
              padding:
                "40px 20px",

              textAlign:
                "center",

              border:
                "1px dashed #d9c9e4",

              borderRadius:
                "10px",

              background:
                "#fcf9fe",
            }}
          >
            <div
              style={{
                fontWeight:
                  "700",

                color:
                  "#542378",

                marginBottom:
                  "7px",
              }}
            >
              No unbatched payouts are
              ready
            </div>

            <div
              style={{
                fontSize:
                  "12px",

                color:
                  "#756b7b",
              }}
            >
              Eligible earnings will
              appear here until they are
              placed into a draft batch.
            </div>
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
                  "950px",
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
                    Seller
                  </th>

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
                    Entries
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Amount
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Payout Setup
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Nexus ID
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
                {payoutSellers.map(
                  (seller) => (
                    <tr
                      key={
                        seller.id
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
                          seller.businessName
                        }
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {
                          seller.sellerCode
                        }
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {
                          seller
                            .eligibleEntryCount
                        }
                      </td>


                      <td
                        style={{
                          ...tableCellStyle,

                          fontWeight:
                            "700",

                          color:
                            "#542378",
                        }}
                      >
                        {formatMoney(
                          seller
                            .payoutReadyCents,
                        )}
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


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {seller
                          .nexusSellerId ||
                          "Not assigned"}
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        <button
                          type="button"

                          disabled={
                            isSubmitting
                          }

                          onClick={() => {
                            batchFetcher.submit(
                              {
                                intent:
                                  "create-draft-batch",

                                sellerId:
                                  seller.id,
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
                              "9px 12px",

                            fontWeight:
                              "700",

                            fontSize:
                              "12px",

                            cursor:
                              isSubmitting
                                ? "wait"
                                : "pointer",
                          }}
                        >
                          {isSubmitting
                            ? "Creating..."
                            : "Create Draft Batch"}
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


      {/* ===============================================
          UNBATCHED ENTRY DETAILS
      =============================================== */}

      {payoutSellers.map(
        (seller) => (
          <div
            key={
              seller.sellerCode
            }

            style={{
              ...cardStyle,

              marginTop:
                "18px",
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
                      "18px",
                  }}
                >
                  {
                    seller.businessName
                  }
                </h2>

                <div
                  style={{
                    color:
                      "#756b7b",

                    fontSize:
                      "12px",

                    marginTop:
                      "4px",
                  }}
                >
                  Unbatched eligible
                  transaction detail
                </div>
              </div>


              <div
                style={{
                  background:
                    "#f8f1fc",

                  color:
                    "#542378",

                  padding:
                    "8px 13px",

                  borderRadius:
                    "20px",

                  fontWeight:
                    "700",

                  fontSize:
                    "13px",
                }}
              >
                {formatMoney(
                  seller
                    .payoutReadyCents,
                )}{" "}
                Ready
              </div>
            </div>


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
                      Order
                    </th>

                    <th
                      style={
                        tableHeaderStyle
                      }
                    >
                      Created
                    </th>

                    <th
                      style={
                        tableHeaderStyle
                      }
                    >
                      Funds Status
                    </th>

                    <th
                      style={
                        tableHeaderStyle
                      }
                    >
                      Funds Cleared
                    </th>

                    <th
                      style={
                        tableHeaderStyle
                      }
                    >
                      Eligible On
                    </th>

                    <th
                      style={
                        tableHeaderStyle
                      }
                    >
                      Ledger
                    </th>

                    <th
                      style={
                        tableHeaderStyle
                      }
                    >
                      Earnings
                    </th>

                    <th
                      style={
                        tableHeaderStyle
                      }
                    >
                      Paid
                    </th>

                    <th
                      style={
                        tableHeaderStyle
                      }
                    >
                      Remaining
                    </th>
                  </tr>
                </thead>


                <tbody>
                  {seller.entries.map(
                    (entry) => (
                      <tr
                        key={
                          entry.id
                        }
                      >
                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {entry
                            .shopifyOrderName ||
                            entry
                              .shopifyOrderId}
                        </td>


                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {formatDate(
                            entry
                              .createdAt,
                          )}
                        </td>


                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          <span
                            style={{
                              display:
                                "inline-block",

                              padding:
                                "5px 8px",

                              borderRadius:
                                "14px",

                              fontWeight:
                                "700",

                              fontSize:
                                "11px",

                              ...getFundsStatusStyle(
                                entry
                                  .fundsStatus,
                              ),
                            }}
                          >
                            {getFundsStatusLabel(
                              entry
                                .fundsStatus,
                            )}
                          </span>
                        </td>


                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {formatDate(
                            entry
                              .fundsClearedAt,
                          )}
                        </td>


                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {formatDate(
                            entry
                              .availableOn,
                          )}
                        </td>


                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {
                            entry.status
                          }
                        </td>


                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {formatMoney(
                            entry
                              .sellerEarningsCents,

                            entry
                              .currency,
                          )}
                        </td>


                        <td
                          style={
                            tableCellStyle
                          }
                        >
                          {formatMoney(
                            entry
                              .payoutAmountCents,

                            entry
                              .currency,
                          )}
                        </td>


                        <td
                          style={{
                            ...tableCellStyle,

                            fontWeight:
                              "700",

                            color:
                              "#542378",
                          }}
                        >
                          {formatMoney(
                            entry
                              .remainingCents,

                            entry
                              .currency,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ),
      )}


      {/* ===============================================
          DRAFT BATCHES
      =============================================== */}

      <div
        style={{
          ...cardStyle,

          marginTop:
            "24px",
        }}
      >
        <h2
          style={{
            marginTop:
              0,

            color:
              "#542378",

            fontSize:
              "20px",
          }}
        >
          Draft Payout Batches
        </h2>


        <div
          style={{
            fontSize:
              "12px",

            color:
              "#756b7b",

            marginBottom:
              "18px",
          }}
        >
          Draft batches reserve ledger
          entries but do not send money.
        </div>


        {draftBatches.length ===
        0 ? (
          <div
            style={{
              padding:
                "28px",

              textAlign:
                "center",

              background:
                "#fcf9fe",

              border:
                "1px dashed #d9c9e4",

              borderRadius:
                "10px",

              color:
                "#756b7b",

              fontSize:
                "12px",
            }}
          >
            No draft payout batches.
          </div>
        ) : (
          draftBatches.map(
            (batch) => (
              <div
                key={
                  batch.id
                }

                style={{
                  border:
                    "1px solid #e7dbee",

                  borderRadius:
                    "12px",

                  padding:
                    "16px",

                  marginTop:
                    "12px",

                  background:
                    "#fcf9fe",
                }}
              >
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
                  <div>
                    <Link
                      to={`/app/payout-batch/${batch.batchCode}`}

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
                        batch.batchCode
                      }
                    </Link>

                    <div
                      style={{
                        fontSize:
                          "12px",

                        color:
                          "#756b7b",

                        marginTop:
                          "4px",
                      }}
                    >
                      {
                        batch.seller
                          .businessName
                      }{" "}
                      ·{" "}
                      {formatDate(
                        batch
                          .createdAt,
                      )}
                    </div>
                  </div>


                  <div
                    style={{
                      textAlign:
                        "right",
                    }}
                  >
                    <div
                      style={{
                        fontWeight:
                          "700",

                        color:
                          "#542378",
                      }}
                    >
                      {formatMoney(
                        batch
                          .totalAmountCents,

                        batch
                          .currency,
                      )}
                    </div>

                    <div
                      style={{
                        fontSize:
                          "11px",

                        color:
                          "#756b7b",

                        marginTop:
                          "3px",
                      }}
                    >
                      DRAFT
                    </div>
                  </div>
                </div>
              </div>
            ),
          )
        )}
      </div>


      {/* ===============================================
          NAVIGATION
      =============================================== */}

      <div
        style={{
          display:
            "flex",

          gap:
            "14px",

          marginTop:
            "20px",

          flexWrap:
            "wrap",
        }}
      >
        <Link
          to="/app/eligibility"

          style={{
            color:
              "#542378",

            fontWeight:
              "700",

            textDecoration:
              "none",

            fontSize:
              "13px",
          }}
        >
          Payout Eligibility
        </Link>


        <Link
          to="/app"

          style={{
            color:
              "#756b7b",

            fontWeight:
              "700",

            textDecoration:
              "none",

            fontSize:
              "13px",
          }}
        >
          Back to HairGrab Core
        </Link>
      </div>


      <div
        style={{
          marginTop:
            "20px",

          textAlign:
            "center",

          fontSize:
            "12px",

          color:
            "#948a99",
        }}
      >
        HairGrab Core · Payout Control Center
      </div>
    </div>
  );
}
