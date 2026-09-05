import type { LoaderFunctionArgs } from "react-router";
import {
  Link,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { requireSellerSession } from "../seller-session.server";
import { syncSellerProductsFromShopify } from "../shopify-product-sync.server";


// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {

  // Identify the seller from the signed HairGrab seller cookie.
  const { seller } =
    await requireSellerSession(request);


  // --------------------------------------------------------
  // ADOPT / SYNC EXISTING SHOPIFY PRODUCTS
  //
  // Quietly makes sure every Shopify product whose Vendor
  // matches this seller belongs to the seller in HairGrab Core.
  // This is idempotent: refreshing the dashboard will not
  // duplicate products.
  // --------------------------------------------------------

  try {
    await syncSellerProductsFromShopify(seller);
  } catch (error) {
    // A temporary Shopify sync issue should never prevent the
    // seller from opening their HairGrab dashboard.
    console.error(
      "[HairGrab Core] Seller product adoption sync failed:",
      error,
    );
  }


  // --------------------------------------------------------
  // PRODUCTS
  // --------------------------------------------------------

  const activeProducts =
    await db.sellerProduct.count({
      where: {
        sellerId: seller.id,
        status: "ACTIVE",
      },
    });


  // --------------------------------------------------------
  // SELLER LEDGER
  //
  // Money is stored in Prisma as cents.
  // One Shopify order can have multiple ledger entries, so
  // financial totals come from the ledger while order count
  // uses unique Shopify order IDs.
  // --------------------------------------------------------

  const ledgerEntries =
    await db.sellerLedgerEntry.findMany({
      where: {
        sellerId: seller.id,
      },

      select: {
        shopifyOrderId: true,
        grossAmountCents: true,
        sellerEarningsCents: true,
        commissionAmountCents: true,
        status: true,
      },
    });


  let grossSales = 0;
  let sellerEarnings = 0;
  let commission = 0;
  let payoutReady = 0;

  const orderIds =
    new Set<string>();


  for (const entry of ledgerEntries) {

    grossSales +=
      Number(entry.grossAmountCents || 0) / 100;

    sellerEarnings +=
      Number(entry.sellerEarningsCents || 0) / 100;

    commission +=
      Number(entry.commissionAmountCents || 0) / 100;

    if (entry.status === "ELIGIBLE") {
      payoutReady +=
        Number(entry.sellerEarningsCents || 0) / 100;
    }


    if (entry.shopifyOrderId) {
      orderIds.add(
        String(entry.shopifyOrderId),
      );
    }
  }


  return {
    seller: {
      id:
        seller.id,

      businessName:
        seller.businessName,

      sellerCode:
        seller.sellerCode,
    },

    stats: {
      grossSales,
      sellerEarnings,
      commission,
      payoutReady,

      totalOrders:
        orderIds.size,

      activeProducts,

      // Shopify fulfillment status will be wired next.
      ordersToFulfill:
        0,
    },
  };
};


// ==========================================================
// MONEY FORMATTER
// ==========================================================

function money(
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


// ==========================================================
// DASHBOARD
// ==========================================================

export default function SellerDashboard() {

  const {
    seller,
    stats,
  } =
    useLoaderData<
      typeof loader
    >();


  return (
    <div
      style={{
        minHeight:
          "100vh",

        background:
          "#faf8fc",

        fontFamily:
          "Arial, Helvetica, sans-serif",

        color:
          "#21152a",
      }}
    >

      {/* ================================================== */}
      {/* HEADER */}
      {/* ================================================== */}

      <header
        style={{
          background:
            "#4B1678",

          color:
            "white",

          padding:
            "18px 24px",
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

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap:
              "20px",

            flexWrap:
              "wrap",
          }}
        >

          <div>

            <div
              style={{
                fontSize:
                  "12px",

                fontWeight:
                  700,

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
                  "24px",

                fontWeight:
                  800,

                marginTop:
                  "3px",
              }}
            >
              Seller Dashboard
            </div>

          </div>


          <Link
            to="/seller/add-product"
            style={{
              background:
                "white",

              color:
                "#4B1678",

              padding:
                "11px 18px",

              borderRadius:
                "8px",

              textDecoration:
                "none",

              fontWeight:
                800,

              fontSize:
                "14px",
            }}
          >
            + Add Product
          </Link>

        </div>
      </header>


      {/* ================================================== */}
      {/* MAIN */}
      {/* ================================================== */}

      <main
        style={{
          maxWidth:
            "1180px",

          margin:
            "0 auto",

          padding:
            "30px 20px 60px",
        }}
      >

        {/* ================================================ */}
        {/* WELCOME */}
        {/* ================================================ */}

        <section
          style={{
            marginBottom:
              "26px",
          }}
        >

          <div
            style={{
              color:
                "#4B1678",

              fontSize:
                "12px",

              fontWeight:
                800,

              letterSpacing:
                "0.8px",

              marginBottom:
                "6px",
            }}
          >
            {seller.sellerCode}
          </div>


          <h1
            style={{
              margin:
                0,

              fontSize:
                "30px",

              color:
                "#4B1678",
            }}
          >
            Welcome, {seller.businessName}
          </h1>


          <p
            style={{
              margin:
                "7px 0 0",

              color:
                "#6f6575",

              fontSize:
                "15px",
            }}
          >
            Here's what's happening with your HairGrab store.
          </p>

        </section>


        {/* ================================================ */}
        {/* ANNOUNCEMENT */}
        {/* ================================================ */}

        <section
          style={{
            background:
              "#f2eafa",

            border:
              "1px solid #e2d1ef",

            borderRadius:
              "12px",

            padding:
              "16px 18px",

            marginBottom:
              "24px",
          }}
        >

          <div
            style={{
              color:
                "#4B1678",

              fontWeight:
                800,

              fontSize:
                "14px",

              marginBottom:
                "4px",
            }}
          >
            HairGrab Announcement
          </div>


          <div
            style={{
              fontSize:
                "14px",

              lineHeight:
                1.5,
            }}
          >
            Welcome to HairGrab! Your seller dashboard is ready.
          </div>

        </section>


        {/* ================================================ */}
        {/* STATS */}
        {/* ================================================ */}

        <section
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(190px, 1fr))",

            gap:
              "14px",

            marginBottom:
              "28px",
          }}
        >

          <StatCard
            label="Sales"
            value={
              money(
                stats.grossSales,
              )
            }
            subtext="Gross marketplace sales"
          />


          <StatCard
            label="Orders"
            value={
              stats.totalOrders
            }
            subtext="Total HairGrab orders"
          />


          <StatCard
            label="To Fulfill"
            value={
              stats.ordersToFulfill
            }
            subtext="Orders needing attention"
          />


          <StatCard
            label="Products"
            value={
              stats.activeProducts
            }
            subtext="Active products"
            link="/seller/products"
          />

        </section>


        {/* ================================================ */}
        {/* MAIN ACTIONS */}
        {/* ================================================ */}

        <section
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",

            gap:
              "16px",

            marginBottom:
              "28px",
          }}
        >

          <DashboardAction
            title="Orders"
            description="See new orders and quickly find what needs to be shipped or fulfilled."
            link="/seller/orders"
            button="View Orders"
          />


          <DashboardAction
            title="My Store"
            description="Manage the information shoppers see about your HairGrab store."
            link="/seller/store"
            button="Manage Store"
          />

        </section>


        {/* ================================================ */}
        {/* FINANCIAL SUMMARY */}
        {/* ================================================ */}

        <section
          style={{
            background:
              "white",

            border:
              "1px solid #e5dce9",

            borderRadius:
              "14px",

            padding:
              "20px",

            marginBottom:
              "28px",
          }}
        >

          <h2
            style={{
              margin:
                "0 0 16px",

              color:
                "#4B1678",

              fontSize:
                "19px",
            }}
          >
            Earnings
          </h2>


          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",

              gap:
                "18px",
            }}
          >

            <FinancialItem
              label="Gross Sales"
              value={
                money(
                  stats.grossSales,
                )
              }
            />


            <FinancialItem
              label="HairGrab Commission"
              value={
                money(
                  stats.commission,
                )
              }
            />


            <FinancialItem
              label="Your Earnings"
              value={
                money(
                  stats.sellerEarnings,
                )
              }
            />

          </div>

        </section>


        {/* ================================================ */}
        {/* ORDERS TO FULFILL */}
        {/* ================================================ */}

        <section
          style={{
            background:
              "white",

            border:
              "1px solid #e5dce9",

            borderRadius:
              "14px",

            overflow:
              "hidden",

            marginBottom:
              "28px",
          }}
        >

          <div
            style={{
              padding:
                "18px 20px",

              borderBottom:
                "1px solid #eee5f1",

              display:
                "flex",

              justifyContent:
                "space-between",

              alignItems:
                "center",

              gap:
                "15px",
            }}
          >

            <div>

              <h2
                style={{
                  margin:
                    0,

                  color:
                    "#4B1678",

                  fontSize:
                    "19px",
                }}
              >
                Orders To Fulfill
              </h2>


              <div
                style={{
                  fontSize:
                    "13px",

                  color:
                    "#817686",

                  marginTop:
                    "3px",
                }}
              >
                New orders that need your attention.
              </div>

            </div>


            <Link
              to="/seller/orders"
              style={{
                color:
                  "#4B1678",

                fontWeight:
                  800,

                textDecoration:
                  "none",

                fontSize:
                  "13px",
              }}
            >
              View All
            </Link>

          </div>


          <div
            style={{
              padding:
                "38px 20px",

              textAlign:
                "center",

              color:
                "#817686",

              fontSize:
                "14px",
            }}
          >
            Shopify fulfillment status will appear here.
          </div>

        </section>


        {/* ================================================ */}
        {/* SELLER TOOLS */}
        {/* ================================================ */}

        <section>

          <h2
            style={{
              color:
                "#4B1678",

              fontSize:
                "20px",

              marginBottom:
                "14px",
            }}
          >
            Seller Tools
          </h2>


          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",

              gap:
                "12px",
            }}
          >

            <ToolCard
              title="Messages"
              description="Chat with HairGrab support."
              status="Coming Soon"
            />


            <ToolCard
              title="Notifications"
              description="Order and marketplace alerts."
              status="Coming Soon"
            />


            <ToolCard
              title="Announcements"
              description="Important HairGrab marketplace updates."
              status="Active"
            />


            <ToolCard
              title="Store Settings"
              description="Update your seller and storefront information."
              status="Coming Soon"
            />

          </div>

        </section>

      </main>
    </div>
  );
}


// ==========================================================
// STAT CARD
// ==========================================================

function StatCard({
  label,
  value,
  subtext,
  link,
}: {
  label: string;
  value: string | number;
  subtext: string;
  link?: string;
}) {

  const card = (
    <div
      style={{
        background:
          "white",

        border:
          "1px solid #e5dce9",

        borderRadius:
          "12px",

        padding:
          "18px",

        height:
          "100%",

        boxSizing:
          "border-box",

        cursor:
          link
            ? "pointer"
            : "default",
      }}
    >

      <div
        style={{
          fontSize:
            "12px",

          color:
            "#756b79",

          fontWeight:
            700,

          marginBottom:
            "7px",
        }}
      >
        {label}
      </div>


      <div
        style={{
          fontSize:
            "26px",

          color:
            "#4B1678",

          fontWeight:
            800,
        }}
      >
        {value}
      </div>


      <div
        style={{
          marginTop:
            "5px",

          color:
            "#938a97",

          fontSize:
            "12px",
        }}
      >
        {subtext}
      </div>

    </div>
  );

  if (!link) {
    return card;
  }

  return (
    <Link
      to={link}
      style={{
        textDecoration:
          "none",

        color:
          "inherit",

        display:
          "block",
      }}
    >
      {card}
    </Link>
  );
}


// ==========================================================
// DASHBOARD ACTION
// ==========================================================

function DashboardAction({
  title,
  description,
  link,
  button,
}: {
  title: string;
  description: string;
  link: string;
  button: string;
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

        padding:
          "20px",
      }}
    >

      <h2
        style={{
          margin:
            "0 0 8px",

          color:
            "#4B1678",

          fontSize:
            "19px",
        }}
      >
        {title}
      </h2>


      <p
        style={{
          color:
            "#746b78",

          fontSize:
            "14px",

          lineHeight:
            1.5,

          minHeight:
            "63px",

          margin:
            "0 0 16px",
        }}
      >
        {description}
      </p>


      <Link
        to={link}
        style={{
          display:
            "inline-block",

          background:
            "#4B1678",

          color:
            "white",

          padding:
            "10px 15px",

          borderRadius:
            "7px",

          textDecoration:
            "none",

          fontSize:
            "13px",

          fontWeight:
            800,
        }}
      >
        {button}
      </Link>

    </div>
  );
}


// ==========================================================
// FINANCIAL ITEM
// ==========================================================

function FinancialItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (
    <div>

      <div
        style={{
          color:
            "#817686",

          fontSize:
            "12px",

          marginBottom:
            "5px",
        }}
      >
        {label}
      </div>


      <div
        style={{
          color:
            "#4B1678",

          fontSize:
            "20px",

          fontWeight:
            800,
        }}
      >
        {value}
      </div>

    </div>
  );
}


// ==========================================================
// TOOL CARD
// ==========================================================

function ToolCard({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: string;
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
          "16px",
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
            "10px",
        }}
      >

        <strong
          style={{
            color:
              "#4B1678",

            fontSize:
              "15px",
          }}
        >
          {title}
        </strong>


        <span
          style={{
            background:
              status === "Active"
                ? "#edf8ef"
                : "#f3edf7",

            color:
              status === "Active"
                ? "#28743b"
                : "#6d447e",

            padding:
              "4px 7px",

            borderRadius:
              "20px",

            fontSize:
              "10px",

            fontWeight:
              800,

            whiteSpace:
              "nowrap",
          }}
        >
          {status}
        </span>

      </div>


      <div
        style={{
          marginTop:
            "8px",

          color:
            "#817686",

          fontSize:
            "12px",

          lineHeight:
            1.4,
        }}
      >
        {description}
      </div>

    </div>
  );
}