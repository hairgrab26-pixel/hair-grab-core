import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import { requireSellerSession } from "../seller-session.server";
import { syncSellerProductsFromShopify } from "../shopify-product-sync.server";

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  try {
    await syncSellerProductsFromShopify(
      seller,
    );
  } catch (error) {
    console.error(
      "[HairGrab Core] Seller product sync failed:",
      error,
    );
  }

  const activeProducts =
    await db.sellerProduct.count({
      where: {
        sellerId: seller.id,
        status: "ACTIVE",
      },
    });

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
        shopifyFulfillmentId: true,
        deliveredAt: true,
      },
    });

  let grossSales = 0;
  let sellerEarnings = 0;
  let commission = 0;
  let payoutReady = 0;

  const orderIds =
    new Set<string>();

  const shippedOrderIds =
    new Set<string>();

  const deliveredOrderIds =
    new Set<string>();

  for (const entry of ledgerEntries) {
    grossSales +=
      Number(
        entry.grossAmountCents || 0,
      ) / 100;

    sellerEarnings +=
      Number(
        entry.sellerEarningsCents || 0,
      ) / 100;

    commission +=
      Number(
        entry.commissionAmountCents || 0,
      ) / 100;

    if (
      entry.status ===
      "ELIGIBLE"
    ) {
      payoutReady +=
        Number(
          entry.sellerEarningsCents ||
            0,
        ) / 100;
    }

    if (
      entry.shopifyOrderId
    ) {
      const orderId =
        String(
          entry.shopifyOrderId,
        );

      orderIds.add(
        orderId,
      );

      if (
        entry.deliveredAt
      ) {
        deliveredOrderIds.add(
          orderId,
        );
      } else if (
        entry.shopifyFulfillmentId
      ) {
        shippedOrderIds.add(
          orderId,
        );
      }
    }
  }

  const delivered =
    deliveredOrderIds.size;

  const shipped =
    Array.from(
      shippedOrderIds,
    ).filter(
      (id) =>
        !deliveredOrderIds.has(
          id,
        ),
    ).length;

  const readyToShip =
    Math.max(
      0,
      orderIds.size -
        shipped -
        delivered,
    );

  const conversation =
    await db.sellerConversation.findUnique({
      where: {
        sellerId:
          seller.id,
      },

      select: {
        id: true,
      },
    });

  let unreadMessages = 0;

  if (conversation) {
    unreadMessages =
      await db.sellerMessage.count({
        where: {
          conversationId:
            conversation.id,

          senderType:
            "HAIRGRAB",

          readBySellerAt:
            null,
        },
      });
  }

  return {
    seller: {
      businessName:
        seller.businessName,

      sellerCode:
        seller.sellerCode,
    },

    stats: {
      activeProducts,
      totalOrders:
        orderIds.size,
      readyToShip,
      shipped,
      delivered,
      grossSales,
      commission,
      sellerEarnings,
      payoutReady,
      unreadMessages,
    },
  };
};

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
  ).format(
    amount,
  );
}

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
              "16px",

            flexWrap:
              "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize:
                  "10px",

                fontWeight:
                  "800",

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
                  "23px",

                fontWeight:
                  "800",
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

              textDecoration:
                "none",

              fontWeight:
                "800",

              fontSize:
                "13px",

              padding:
                "11px 16px",

              borderRadius:
                "8px",
            }}
          >
            + Add Product
          </Link>
        </div>
      </header>

      <main
        style={{
          maxWidth:
            "1180px",

          margin:
            "0 auto",

          padding:
            "28px 20px 60px",
        }}
      >
        <section
          style={{
            marginBottom:
              "22px",
          }}
        >
          <div
            style={{
              color:
                "#4B1678",

              fontSize:
                "11px",

              fontWeight:
                "800",

              letterSpacing:
                "0.8px",
            }}
          >
            {seller.sellerCode}
          </div>

          <h1
            style={{
              margin:
                "5px 0 5px",

              color:
                "#4B1678",

              fontSize:
                "30px",
            }}
          >
            Welcome, {seller.businessName}
          </h1>

          <div
            style={{
              color:
                "#6f6575",

              fontSize:
                "14px",
            }}
          >
            Everything you need to run your HairGrab store.
          </div>
        </section>

        <section
          style={{
            background:
              "#f2eafa",

            border:
              "1px solid #e2d1ef",

            borderRadius:
              "12px",

            padding:
              "14px 16px",

            marginBottom:
              "26px",
          }}
        >
          <div
            style={{
              color:
                "#4B1678",

              fontWeight:
                "800",

              fontSize:
                "13px",
            }}
          >
            HairGrab Announcement
          </div>

          <div
            style={{
              marginTop:
                "4px",

              fontSize:
                "13px",
            }}
          >
            Welcome to HairGrab! Your seller dashboard is ready.
          </div>
        </section>

        <section>
          <div
            style={{
              marginBottom:
                "14px",
            }}
          >
            <h2
              style={{
                margin:
                  0,

                color:
                  "#4B1678",

                fontSize:
                  "23px",
              }}
            >
              My Store
            </h2>

            <div
              style={{
                color:
                  "#756b79",

                fontSize:
                  "12px",

                marginTop:
                  "3px",
              }}
            >
              Manage your products, orders and storefront from one place.
            </div>
          </div>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(250px, 1fr))",

              gap:
                "14px",
            }}
          >
            <StoreTile
              title="Products"
              value={`${stats.activeProducts} Active`}
              text="Edit listings, inventory, pricing and store view."
              to="/seller/products"
            />

            <StoreTile
              title="Orders & Shipping"
              value={`${stats.readyToShip} Ready to Ship`}
              text={`${stats.shipped} Shipped · ${stats.delivered} Delivered · ${stats.totalOrders} Total`}
              to="/seller/orders"
            />

            <StoreTile
              title="Messages"
              value={
                stats.unreadMessages >
                0
                  ? `${stats.unreadMessages} Unread`
                  : "HairGrab Support"
              }
              text="Private communication between your store and HairGrab."
              to="/seller/messages"
              active
              badge={
                stats.unreadMessages >
                0
                  ? String(
                      stats.unreadMessages,
                    )
                  : undefined
              }
            />

            <StoreTile
              title="Notifications"
              value="Marketplace Alerts"
              text="Important HairGrab, order and shipping notices."
              comingSoon
            />

            <StoreTile
              title="Store Settings"
              value="Storefront & Fulfillment"
              text="Edit your storefront, business details, shipping and selling preferences."
              to="/seller/settings"
            />
          </div>
        </section>

        <section
          style={{
            marginTop:
              "28px",

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
                "0 0 15px",

              color:
                "#4B1678",

              fontSize:
                "19px",
            }}
          >
            Financials
          </h2>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(160px, 1fr))",

              gap:
                "16px",
            }}
          >
            <Financial
              label="Gross Sales"
              value={
                money(
                  stats.grossSales,
                )
              }
            />

            <Financial
              label="HairGrab Fee"
              value={
                money(
                  stats.commission,
                )
              }
            />

            <Financial
              label="Your Earnings"
              value={
                money(
                  stats.sellerEarnings,
                )
              }
            />

            <Financial
              label="Payout Ready"
              value={
                money(
                  stats.payoutReady,
                )
              }
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function StoreTile({
  title,
  value,
  text,
  to,
  comingSoon,
  active,
  badge,
}: {
  title: string;
  value: string;
  text: string;
  to?: string;
  comingSoon?: boolean;
  active?: boolean;
  badge?: string;
}) {
  const card = (
    <div
      style={{
        background:
          "white",

        border:
          active
            ? "1px solid #cdb9db"
            : "1px solid #e5dce9",

        borderRadius:
          "14px",

        padding:
          "20px",

        minHeight:
          "125px",

        boxSizing:
          "border-box",

        cursor:
          to
            ? "pointer"
            : "default",

        position:
          "relative",
      }}
    >
      <div
        style={{
          display:
            "flex",

          justifyContent:
            "space-between",

          gap:
            "8px",

          alignItems:
            "start",
        }}
      >
        <div
          style={{
            color:
              "#4B1678",

            fontWeight:
              "800",

            fontSize:
              "17px",
          }}
        >
          {title}
        </div>

        {comingSoon && (
          <span
            style={{
              background:
                "#f2eafa",

              color:
                "#6d447e",

              borderRadius:
                "20px",

              padding:
                "4px 7px",

              fontSize:
                "9px",

              fontWeight:
                "800",
            }}
          >
            Coming Soon
          </span>
        )}

        {!comingSoon &&
          active &&
          !badge && (
            <span
              style={{
                background:
                  "#edf8ef",

                color:
                  "#28743b",

                borderRadius:
                  "20px",

                padding:
                  "4px 7px",

                fontSize:
                  "9px",

                fontWeight:
                  "800",
              }}
            >
              Active
            </span>
          )}

        {badge && (
          <span
            style={{
              background:
                "#4B1678",

              color:
                "#ffffff",

              borderRadius:
                "20px",

              minWidth:
                "20px",

              height:
                "20px",

              padding:
                "0 6px",

              display:
                "inline-flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              fontSize:
                "10px",

              fontWeight:
                "800",
            }}
          >
            {badge}
          </span>
        )}
      </div>

      <div
        style={{
          color:
            "#2b1b35",

          fontSize:
            "14px",

          fontWeight:
            "800",

          marginTop:
            "16px",
        }}
      >
        {value}
      </div>

      <div
        style={{
          color:
            "#756b79",

          fontSize:
            "12px",

          lineHeight:
            1.45,

          marginTop:
            "5px",
        }}
      >
        {text}
      </div>

      {to && (
        <div
          style={{
            color:
              "#4B1678",

            fontSize:
              "10px",

            fontWeight:
              "800",

            marginTop:
              "12px",
          }}
        >
          Open →
        </div>
      )}
    </div>
  );

  if (!to) {
    return card;
  }

  return (
    <Link
      to={to}
      style={{
        color:
          "inherit",

        textDecoration:
          "none",

        display:
          "block",
      }}
    >
      {card}
    </Link>
  );
}

function Financial({
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
            "#756b79",

          fontSize:
            "11px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color:
            "#4B1678",

          fontSize:
            "19px",

          fontWeight:
            "800",

          marginTop:
            "4px",
        }}
      >
        {value}
      </div>
    </div>
  );
}