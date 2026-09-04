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
      where: {
        entryType: "SALE",
      },
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


  type OrderSummary = {
    shopifyOrderId: string;
    shopifyOrderName: string;
    currency: string;
    createdAt: string;

    sellers: Map<
      string,
      {
        sellerCode: string;
        businessName: string;
      }
    >;

    grossAmountCents: number;
    commissionAmountCents: number;
    sellerEarningsCents: number;

    statuses: Set<string>;
    lineItemCount: number;
  };


  const orderMap =
    new Map<string, OrderSummary>();


  for (const entry of entries) {
    let order =
      orderMap.get(
        entry.shopifyOrderId,
      );

    if (!order) {
      order = {
        shopifyOrderId:
          entry.shopifyOrderId,

        shopifyOrderName:
          entry.shopifyOrderName ||
          entry.shopifyOrderId,

        currency:
          entry.currency,

        createdAt:
          (
            entry.shopifyCreatedAt ||
            entry.createdAt
          ).toISOString(),

        sellers: new Map(),

        grossAmountCents: 0,
        commissionAmountCents: 0,
        sellerEarningsCents: 0,

        statuses: new Set(),
        lineItemCount: 0,
      };

      orderMap.set(
        entry.shopifyOrderId,
        order,
      );
    }


    order.sellers.set(
      entry.seller.sellerCode,
      {
        sellerCode:
          entry.seller.sellerCode,

        businessName:
          entry.seller.businessName,
      },
    );


    order.grossAmountCents +=
      entry.grossAmountCents;

    order.commissionAmountCents +=
      entry.commissionAmountCents;

    order.sellerEarningsCents +=
      entry.sellerEarningsCents;

    order.statuses.add(
      entry.status,
    );

    order.lineItemCount += 1;
  }


  const orders =
    Array.from(
      orderMap.values(),
    ).map((order) => ({
      shopifyOrderId:
        order.shopifyOrderId,

      shopifyOrderName:
        order.shopifyOrderName,

      currency:
        order.currency,

      createdAt:
        order.createdAt,

      sellers:
        Array.from(
          order.sellers.values(),
        ),

      grossAmountCents:
        order.grossAmountCents,

      commissionAmountCents:
        order.commissionAmountCents,

      sellerEarningsCents:
        order.sellerEarningsCents,

      statuses:
        Array.from(
          order.statuses,
        ),

      lineItemCount:
        order.lineItemCount,
    }));


  const totalSalesCents =
    orders.reduce(
      (total, order) =>
        total +
        order.grossAmountCents,
      0,
    );


  const totalCommissionCents =
    orders.reduce(
      (total, order) =>
        total +
        order.commissionAmountCents,
      0,
    );


  const totalSellerEarningsCents =
    orders.reduce(
      (total, order) =>
        total +
        order.sellerEarningsCents,
      0,
    );


  return {
    orders,
    totalSalesCents,
    totalCommissionCents,
    totalSellerEarningsCents,
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
  color: "#542378",
  fontSize: "12px",
  fontWeight: "700",
};


const tableCellStyle = {
  padding: "14px 12px",
  borderBottom:
    "1px solid #eee6f2",
  color: "#35273d",
  fontSize: "13px",
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
  value: string,
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(
    new Date(value),
  );
}


export default function OrdersPage() {
  const {
    orders,
    totalSalesCents,
    totalCommissionCents,
    totalSellerEarningsCents,
  } =
    useLoaderData<typeof loader>();


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
          Orders
        </h1>

        <p
          style={{
            color: "#6f6675",
            fontSize: "15px",
            marginTop: "8px",
          }}
        >
          Marketplace orders processed
          by HairGrab Core and split
          across HairGrab sellers.
        </p>
      </div>


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
              color: "#756b7b",
              fontSize: "12px",
            }}
          >
            Marketplace Orders
          </div>

          <div
            style={{
              color: "#542378",
              fontSize: "30px",
              fontWeight: "700",
              marginTop: "7px",
            }}
          >
            {orders.length}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              color: "#756b7b",
              fontSize: "12px",
            }}
          >
            Shopify Sales
          </div>

          <div
            style={{
              color: "#542378",
              fontSize: "25px",
              fontWeight: "700",
              marginTop: "7px",
            }}
          >
            {formatMoney(
              totalSalesCents,
            )}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              color: "#756b7b",
              fontSize: "12px",
            }}
          >
            HairGrab Commission
          </div>

          <div
            style={{
              color: "#542378",
              fontSize: "25px",
              fontWeight: "700",
              marginTop: "7px",
            }}
          >
            {formatMoney(
              totalCommissionCents,
            )}
          </div>
        </div>


        <div style={cardStyle}>
          <div
            style={{
              color: "#756b7b",
              fontSize: "12px",
            }}
          >
            Seller Earnings
          </div>

          <div
            style={{
              color: "#542378",
              fontSize: "25px",
              fontWeight: "700",
              marginTop: "7px",
            }}
          >
            {formatMoney(
              totalSellerEarningsCents,
            )}
          </div>
        </div>
      </div>


      {/* ORDER TABLE */}

      <div style={cardStyle}>
        <h2
          style={{
            marginTop: 0,
            color: "#542378",
            fontSize: "20px",
          }}
        >
          Marketplace Order Register
        </h2>

        <div
          style={{
            color: "#756b7b",
            fontSize: "12px",
            marginTop: "-7px",
            marginBottom: "18px",
          }}
        >
          Shopify orders containing
          registered HairGrab seller
          products.
        </div>


        {orders.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#756b7b",
              background: "#fcf9fe",
              border:
                "1px dashed #d9c9e4",
              borderRadius: "10px",
            }}
          >
            No marketplace orders have
            been processed yet.
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
                minWidth: "950px",
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
                    Date
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
                    Items
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
                    Seller Earnings
                  </th>

                  <th
                    style={
                      tableHeaderStyle
                    }
                  >
                    Ledger Status
                  </th>
                </tr>
              </thead>


              <tbody>
                {orders.map(
                  (order) => (
                    <tr
                      key={
                        order.shopifyOrderId
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
                              "700",
                            color:
                              "#542378",
                          }}
                        >
                          {
                            order.shopifyOrderName
                          }
                        </div>
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {formatDate(
                          order.createdAt,
                        )}
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {order.sellers.map(
                          (seller) => (
                            <div
                              key={
                                seller.sellerCode
                              }
                              style={{
                                marginBottom:
                                  "4px",
                              }}
                            >
                              <Link
                                to={`/app/seller/${seller.sellerCode}`}
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
                                  seller.businessName
                                }
                              </Link>

                              <span
                                style={{
                                  color:
                                    "#756b7b",
                                  marginLeft:
                                    "6px",
                                  fontSize:
                                    "11px",
                                }}
                              >
                                {
                                  seller.sellerCode
                                }
                              </span>
                            </div>
                          ),
                        )}
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {
                          order.lineItemCount
                        }
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {formatMoney(
                          order.grossAmountCents,
                          order.currency,
                        )}
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {formatMoney(
                          order.commissionAmountCents,
                          order.currency,
                        )}
                      </td>


                      <td
                        style={{
                          ...tableCellStyle,
                          fontWeight: "700",
                        }}
                      >
                        {formatMoney(
                          order.sellerEarningsCents,
                          order.currency,
                        )}
                      </td>


                      <td
                        style={
                          tableCellStyle
                        }
                      >
                        {order.statuses.join(
                          ", ",
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