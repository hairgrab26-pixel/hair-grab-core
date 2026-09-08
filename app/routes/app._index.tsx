import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const activeSellers = await db.seller.count({
    where: {
      status: "ACTIVE",
    },
  });

  const ledgerTotals = await db.sellerLedgerEntry.aggregate({
    _sum: {
      grossAmountCents: true,
      commissionAmountCents: true,
      sellerEarningsCents: true,
      refundAmountCents: true,
    },
  });

  const pendingSellerEarnings = await db.sellerLedgerEntry.aggregate({
    where: {
      status: "PENDING",
    },
    _sum: {
      sellerEarningsCents: true,
    },
  });

  const payoutReady = await db.sellerLedgerEntry.aggregate({
    where: {
      status: "ELIGIBLE",
    },
    _sum: {
      sellerEarningsCents: true,
    },
  });

  const marketplaceOrders = await db.sellerLedgerEntry.groupBy({
    by: ["shopifyOrderId"],
  });

  return {
    activeSellers,
    marketplaceOrders: marketplaceOrders.length,

    financials: {
      grossSalesCents:
        ledgerTotals._sum.grossAmountCents ?? 0,

      commissionCents:
        ledgerTotals._sum.commissionAmountCents ?? 0,

      sellerLiabilityCents:
        ledgerTotals._sum.sellerEarningsCents ?? 0,

      refundReserveCents:
        ledgerTotals._sum.refundAmountCents ?? 0,

      pendingSellerEarningsCents:
        pendingSellerEarnings._sum.sellerEarningsCents ?? 0,

      payoutReadyCents:
        payoutReady._sum.sellerEarningsCents ?? 0,
    },
  };
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5d8ef",
  borderRadius: "14px",
  padding: "22px",
  boxShadow: "0 2px 8px rgba(84, 35, 120, 0.06)",
};

const numberStyle = {
  fontSize: "30px",
  fontWeight: "700",
  color: "#542378",
  margin: "8px 0 2px",
};

const clickableModuleStyle = {
  display: "block",
  border: "1px solid #d8c3e7",
  borderRadius: "10px",
  padding: "16px",
  background: "#fcf9fe",
  textDecoration: "none",
  color: "inherit",
  cursor: "pointer",
};

const inactiveModuleStyle = {
  border: "1px solid #e7dbee",
  borderRadius: "10px",
  padding: "16px",
  background: "#fcf9fe",
  opacity: 0.65,
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function Index() {
  const {
    activeSellers,
    marketplaceOrders,
    financials,
  } = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "28px",
        fontFamily: "Arial, sans-serif",
        color: "#21152a",
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: "28px" }}>
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
            margin: "0",
            fontSize: "32px",
            color: "#542378",
          }}
        >
          HairGrab Core
        </h1>

        <p
          style={{
            marginTop: "8px",
            color: "#6f6675",
            fontSize: "15px",
          }}
        >
          Marketplace accounting, seller earnings and payout control center.
        </p>
      </div>

      {/* SUMMARY CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        <div style={cardStyle}>
          <div style={{ color: "#6f6675", fontSize: "14px" }}>
            Active Sellers
          </div>

          <div style={numberStyle}>
            {activeSellers}
          </div>

          <div style={{ fontSize: "12px", color: "#93899a" }}>
            Seller registry
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: "#6f6675", fontSize: "14px" }}>
            Marketplace Orders
          </div>

          <div style={numberStyle}>
            {marketplaceOrders}
          </div>

          <div style={{ fontSize: "12px", color: "#93899a" }}>
            Orders processed by Core
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: "#6f6675", fontSize: "14px" }}>
            Pending Seller Earnings
          </div>

          <div style={numberStyle}>
            {formatMoney(
              financials.pendingSellerEarningsCents,
            )}
          </div>

          <div style={{ fontSize: "12px", color: "#93899a" }}>
            Not yet payout eligible
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: "#6f6675", fontSize: "14px" }}>
            Payout Ready
          </div>

          <div style={numberStyle}>
            {formatMoney(
              financials.payoutReadyCents,
            )}
          </div>

          <div style={{ fontSize: "12px", color: "#93899a" }}>
            Eligible for next payout
          </div>
        </div>
      </div>

      {/* FINANCIAL OVERVIEW */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "18px",
          marginBottom: "28px",
        }}
      >
        <div style={cardStyle}>
          <h2
            style={{
              marginTop: "0",
              color: "#542378",
              fontSize: "20px",
            }}
          >
            Marketplace Financial Overview
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "18px",
              marginTop: "20px",
            }}
          >
            <div>
              <div style={{ color: "#6f6675", fontSize: "13px" }}>
                Shopify Sales Collected
              </div>

              <div style={{ fontSize: "22px", fontWeight: "700" }}>
                {formatMoney(
                  financials.grossSalesCents,
                )}
              </div>
            </div>

            <div>
              <div style={{ color: "#6f6675", fontSize: "13px" }}>
                Seller Liability
              </div>

              <div style={{ fontSize: "22px", fontWeight: "700" }}>
                {formatMoney(
                  financials.sellerLiabilityCents,
                )}
              </div>
            </div>

            <div>
              <div style={{ color: "#6f6675", fontSize: "13px" }}>
                HairGrab Commission
              </div>

              <div style={{ fontSize: "22px", fontWeight: "700" }}>
                {formatMoney(
                  financials.commissionCents,
                )}
              </div>
            </div>

            <div>
              <div style={{ color: "#6f6675", fontSize: "13px" }}>
                Refund / Risk Reserve
              </div>

              <div style={{ fontSize: "22px", fontWeight: "700" }}>
                {formatMoney(
                  financials.refundReserveCents,
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h2
            style={{
              marginTop: "0",
              color: "#542378",
              fontSize: "20px",
            }}
          >
            Next Payout
          </h2>

          <div
            style={{
              background: "#f8f1fc",
              borderRadius: "12px",
              padding: "18px",
              marginTop: "16px",
            }}
          >
            <div style={{ fontSize: "13px", color: "#6f6675" }}>
              Scheduled
            </div>

            <div
              style={{
                fontSize: "22px",
                fontWeight: "700",
                color: "#542378",
                marginTop: "4px",
              }}
            >
              Not scheduled
            </div>

            <div
              style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "#6f6675",
              }}
            >
              {formatMoney(
                financials.payoutReadyCents,
              )} ready
            </div>
          </div>
        </div>
      </div>

      {/* CORE MODULES */}
      <div style={cardStyle}>
        <h2
          style={{
            marginTop: "0",
            color: "#542378",
            fontSize: "20px",
          }}
        >
          HairGrab Core Modules
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "12px",
            marginTop: "18px",
          }}
        >
          <Link
           to="/app/sellers"
            style={clickableModuleStyle}
          >
            <div
              style={{
                fontWeight: "700",
                color: "#542378",
                marginBottom: "5px",
              }}
            >
              Sellers
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
                lineHeight: "1.4",
              }}
            >
              Seller registry & payout setup
            </div>
          </Link>

          <Link
  to="/app/orders"
  style={clickableModuleStyle}
>
  <div
    style={{
      fontWeight: "700",
      color: "#542378",
      marginBottom: "5px",
    }}
  >
    Orders
  </div>

  <div
    style={{
      fontSize: "12px",
      color: "#756b7b",
      lineHeight: "1.4",
    }}
  >
    Multi-seller order splitting
  </div>
</Link>
          <Link
            to="/app/inventory"
            style={clickableModuleStyle}
          >
            <div
              style={{
                fontWeight: "700",
                color: "#542378",
                marginBottom: "5px",
              }}
            >
              Catalog Inventory
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
                lineHeight: "1.4",
              }}
            >
              Category, length, color & inventory depth
            </div>
          </Link>

          <Link
            to="/app/ledger"
            style={clickableModuleStyle}
          >
            <div
              style={{
                fontWeight: "700",
                color: "#542378",
                marginBottom: "5px",
              }}
            >
              Ledger
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
                lineHeight: "1.4",
              }}
            >
              Seller earnings & adjustments
            </div>
          </Link>

          <div style={inactiveModuleStyle}>
            <div
              style={{
                fontWeight: "700",
                color: "#542378",
                marginBottom: "5px",
              }}
            >
              Commissions
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
                lineHeight: "1.4",
              }}
            >
              HairGrab marketplace fees
            </div>
          </div>

          <Link
  to="/app/payouts"
  style={clickableModuleStyle}
>
  <div
    style={{
      fontWeight: "700",
      color: "#542378",
      marginBottom: "5px",
    }}
  >
    Payouts
  </div>

  <div
    style={{
      fontSize: "12px",
      color: "#756b7b",
      lineHeight: "1.4",
    }}
  >
    Payout batches & status
  </div>
</Link>

          <div style={inactiveModuleStyle}>
            <div
              style={{
                fontWeight: "700",
                color: "#542378",
                marginBottom: "5px",
              }}
            >
              Reconciliation
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#756b7b",
                lineHeight: "1.4",
              }}
            >
              Shopify vs seller balances
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "20px",
          textAlign: "center",
          fontSize: "12px",
          color: "#948a99",
        }}
      >
        HairGrab Core · Development Environment
      </div>
    </div>
  );
}