import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import db from "../db.server";

import {
  requireSellerSession,
} from "../seller-session.server";

import {
  syncSellerProductsFromShopify,
} from "../shopify-product-sync.server";

import {
  syncSellerNotifications,
} from "../notifications.server";


// ==========================================================
// TYPES
// ==========================================================

type OrderAlert = {
  id: string;
  title: string;
  message: string;
  linkUrl: string;
  createdAt: string;
};


// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const {
    seller,
  } =
    await requireSellerSession(
      request,
    );


  try {
    await syncSellerProductsFromShopify(
      seller,
    );
  } catch (
    error
  ) {
    console.error(
      "[HairGrab Core] Seller product sync failed:",
      error,
    );
  }


  await syncSellerNotifications(
    seller.id,
  );


  const [
    activeProducts,
    ledgerEntries,
    conversation,
    unreadNotifications,
  ] =
    await Promise.all([
      db.sellerProduct.count({
        where: {
          sellerId:
            seller.id,

          status:
            "ACTIVE",
        },
      }),

      db.sellerLedgerEntry.findMany({
        where: {
          sellerId:
            seller.id,
        },

        select: {
          shopifyOrderId:
            true,

          grossAmountCents:
            true,

          sellerEarningsCents:
            true,

          commissionAmountCents:
            true,

          status:
            true,

          shopifyFulfillmentId:
            true,

          deliveredAt:
            true,
        },
      }),

      db.sellerConversation.findUnique({
        where: {
          sellerId:
            seller.id,
        },

        select: {
          id:
            true,
        },
      }),

      db.sellerNotification.count({
        where: {
          sellerId:
            seller.id,

          readAt:
            null,
        },
      }),
    ]);


  let grossSales =
    0;

  let sellerEarnings =
    0;

  let commission =
    0;

  let payoutReady =
    0;


  const orderIds =
    new Set<string>();


  const shippedOrderIds =
    new Set<string>();


  const deliveredOrderIds =
    new Set<string>();


  for (
    const entry of
    ledgerEntries
  ) {
    grossSales +=
      Number(
        entry.grossAmountCents ||
          0,
      ) / 100;


    sellerEarnings +=
      Number(
        entry.sellerEarningsCents ||
          0,
      ) / 100;


    commission +=
      Number(
        entry.commissionAmountCents ||
          0,
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
      (
        orderId,
      ) =>
        !deliveredOrderIds.has(
          orderId,
        ),
    ).length;


  const readyToShip =
    Math.max(
      0,

      orderIds.size -
        shipped -
        delivered,
    );


  let unreadMessages =
    0;


  if (
    conversation
  ) {
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

      unreadNotifications,
    },
  };
};


// ==========================================================
// MONEY
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
  ).format(
    amount,
  );
}


// ==========================================================
// HAIRGRAB ORDER CHIME
//
// Web Audio is used so HairGrab does not need to host
// or license an audio file.
// ==========================================================

function playHairGrabOrderChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;


    if (
      !AudioContextClass
    ) {
      return;
    }


    const audioContext =
      new AudioContextClass();


    const masterGain =
      audioContext.createGain();


    masterGain.connect(
      audioContext.destination,
    );


    masterGain.gain.setValueAtTime(
      0.0001,
      audioContext.currentTime,
    );


    masterGain.gain.exponentialRampToValueAtTime(
      0.22,
      audioContext.currentTime +
        0.025,
    );


    masterGain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime +
        1.15,
    );


    const notes = [
      {
        frequency:
          659.25,

        start:
          0,

        duration:
          0.42,
      },

      {
        frequency:
          880,

        start:
          0.18,

        duration:
          0.55,
      },

      {
        frequency:
          1046.5,

        start:
          0.38,

        duration:
          0.65,
      },
    ];


    for (
      const note of
      notes
    ) {
      const oscillator =
        audioContext.createOscillator();


      const noteGain =
        audioContext.createGain();


      oscillator.type =
        "sine";


      oscillator.frequency.setValueAtTime(
        note.frequency,
        audioContext.currentTime +
          note.start,
      );


      noteGain.gain.setValueAtTime(
        0.0001,
        audioContext.currentTime +
          note.start,
      );


      noteGain.gain.exponentialRampToValueAtTime(
        0.9,
        audioContext.currentTime +
          note.start +
          0.02,
      );


      noteGain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime +
          note.start +
          note.duration,
      );


      oscillator.connect(
        noteGain,
      );


      noteGain.connect(
        masterGain,
      );


      oscillator.start(
        audioContext.currentTime +
          note.start,
      );


      oscillator.stop(
        audioContext.currentTime +
          note.start +
          note.duration +
          0.05,
      );
    }


    window.setTimeout(
      () => {
        void audioContext.close();
      },
      1600,
    );
  } catch (
    error
  ) {
    console.error(
      "[HairGrab] Could not play order chime:",
      error,
    );
  }
}


// ==========================================================
// ORDER ALERT CONTROLLER
// ==========================================================

function OrderAlertController() {
  const [
    enabled,
    setEnabled,
  ] =
    useState(
      false,
    );


  const [
    permission,
    setPermission,
  ] =
    useState<
      NotificationPermission |
      "unsupported"
    >(
      "default",
    );


  const initialized =
    useRef(
      false,
    );


  const seenIds =
    useRef<
      Set<string>
    >(
      new Set(),
    );


  // ========================================================
  // LOAD SAVED DEVICE SETTINGS
  // ========================================================

  useEffect(
    () => {
      const savedEnabled =
        window.localStorage.getItem(
          "hairgrab_order_ding_enabled",
        ) ===
        "true";


      setEnabled(
        savedEnabled,
      );


      if (
        "Notification" in
        window
      ) {
        setPermission(
          Notification.permission,
        );
      } else {
        setPermission(
          "unsupported",
        );
      }


      try {
        const savedSeen =
          JSON.parse(
            window.localStorage.getItem(
              "hairgrab_order_ding_seen",
            ) ||
              "[]",
          ) as string[];


        seenIds.current =
          new Set(
            savedSeen,
          );
      } catch {
        seenIds.current =
          new Set();
      }


      initialized.current =
        true;
    },
    [],
  );


  // ========================================================
  // SAVE SEEN IDS
  // ========================================================

  function saveSeenIds() {
    const recentIds =
      Array.from(
        seenIds.current,
      ).slice(
        -100,
      );


    window.localStorage.setItem(
      "hairgrab_order_ding_seen",
      JSON.stringify(
        recentIds,
      ),
    );
  }


  // ========================================================
  // FETCH ALERTS
  // ========================================================

  async function fetchAlerts() {
    const response =
      await fetch(
        "/seller/order-alerts",
        {
          method:
            "GET",

          credentials:
            "include",

          headers: {
            Accept:
              "application/json",
          },

          cache:
            "no-store",
        },
      );


    if (
      !response.ok
    ) {
      throw new Error(
        `Order alert request failed: ${response.status}`,
      );
    }


    const result =
      (await response.json()) as {
        alerts?: OrderAlert[];
      };


    return Array.isArray(
      result.alerts,
    )
      ? result.alerts
      : [];
  }


  // ========================================================
  // ENABLE
  //
  // Existing orders are marked as already seen so turning
  // the feature on does not suddenly ding for old orders.
  // ========================================================

  async function enableAlerts() {
    try {
      if (
        "Notification" in
        window
      ) {
        const result =
          await Notification.requestPermission();


        setPermission(
          result,
        );
      }


      const currentAlerts =
        await fetchAlerts();


      for (
        const alert of
        currentAlerts
      ) {
        seenIds.current.add(
          alert.id,
        );
      }


      saveSeenIds();


      window.localStorage.setItem(
        "hairgrab_order_ding_enabled",
        "true",
      );


      setEnabled(
        true,
      );


      // Confirmation/test sound.
      playHairGrabOrderChime();
    } catch (
      error
    ) {
      console.error(
        "[HairGrab] Could not enable order alerts:",
        error,
      );
    }
  }


  // ========================================================
  // DISABLE
  // ========================================================

  function disableAlerts() {
    window.localStorage.setItem(
      "hairgrab_order_ding_enabled",
      "false",
    );


    setEnabled(
      false,
    );
  }


  // ========================================================
  // POLLING
  // ========================================================

  useEffect(
    () => {
      if (
        !initialized.current ||
        !enabled
      ) {
        return;
      }


      let stopped =
        false;


      async function checkForNewOrders() {
        try {
          const alerts =
            await fetchAlerts();


          if (
            stopped
          ) {
            return;
          }


          // API returns newest first.
          // Reverse so multiple new orders alert oldest first.
          const newAlerts =
            alerts
              .filter(
                (
                  alert,
                ) =>
                  !seenIds.current.has(
                    alert.id,
                  ),
              )
              .reverse();


          for (
            let index =
              0;
            index <
            newAlerts.length;
            index++
          ) {
            const alert =
              newAlerts[
                index
              ];


            seenIds.current.add(
              alert.id,
            );


            saveSeenIds();


            window.setTimeout(
              () => {
                playHairGrabOrderChime();
              },
              index *
                900,
            );


            if (
              "Notification" in
                window &&
              Notification.permission ===
                "granted"
            ) {
              const browserNotification =
                new Notification(
                  alert.title,
                  {
                    body:
                      alert.message,

                    tag:
                      `hairgrab-order-${alert.id}`,
                  },
                );


              browserNotification.onclick =
                () => {
                  window.focus();

                  window.location.href =
                    alert.linkUrl ||
                    "/seller/orders";


                  browserNotification.close();
                };
            }
          }
        } catch (
          error
        ) {
          console.error(
            "[HairGrab] Order alert check failed:",
            error,
          );
        }
      }


      void checkForNewOrders();


      const timer =
        window.setInterval(
          () => {
            void checkForNewOrders();
          },
          7000,
        );


      return () => {
        stopped =
          true;

        window.clearInterval(
          timer,
        );
      };
    },
    [
      enabled,
    ],
  );


  // ========================================================
  // UI
  // ========================================================

  return (
    <div
      style={{
        display:
          "flex",

        alignItems:
          "center",

        gap:
          "8px",

        flexWrap:
          "wrap",
      }}
    >
      {enabled ? (
        <button
          type="button"
          onClick={
            disableAlerts
          }
          title="Turn off HairGrab order sounds on this device."
          style={{
            border:
              "1px solid rgba(255,255,255,.55)",

            background:
              "rgba(255,255,255,.13)",

            color:
              "white",

            borderRadius:
              "8px",

            padding:
              "10px 12px",

            fontWeight:
              "800",

            fontSize:
              "11px",

            cursor:
              "pointer",
          }}
        >
          🔔 Order Ding On
        </button>
      ) : (
        <button
          type="button"
          onClick={
            enableAlerts
          }
          title="Enable HairGrab new-order sounds on this device."
          style={{
            border:
              "1px solid rgba(255,255,255,.65)",

            background:
              "rgba(255,255,255,.12)",

            color:
              "white",

            borderRadius:
              "8px",

            padding:
              "10px 12px",

            fontWeight:
              "800",

            fontSize:
              "11px",

            cursor:
              "pointer",
          }}
        >
          🔕 Enable Order Ding
        </button>
      )}


      {enabled &&
        permission ===
          "denied" && (
          <span
            style={{
              fontSize:
                "9px",

              opacity:
                0.85,
            }}
          >
            Sound on · browser pop-ups blocked
          </span>
        )}
    </div>
  );
}


// ==========================================================
// HELP & UPDATES MENU
// ==========================================================

function HelpUpdatesMenu({
  unreadMessages,
  unreadNotifications,
}: {
  unreadMessages: number;
  unreadNotifications: number;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handleOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const totalUnread = unreadMessages + unreadNotifications;

  return (
    <div
      ref={menuRef}
      style={{
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Help, messages and notifications"
        style={{
          border: "1px solid rgba(255,255,255,.55)",
          background: open ? "white" : "rgba(255,255,255,.13)",
          color: open ? "#4B1678" : "white",
          borderRadius: "9px",
          minHeight: "38px",
          padding: "8px 11px",
          display: "inline-flex",
          alignItems: "center",
          gap: "7px",
          cursor: "pointer",
          fontWeight: 800,
          fontSize: "11px",
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1.5px solid currentColor",
            fontSize: "13px",
            fontWeight: 900,
          }}
        >
          ?
        </span>
        Help & Updates
        {totalUnread > 0 && (
          <span
            style={{
              minWidth: "19px",
              height: "19px",
              padding: "0 5px",
              borderRadius: "20px",
              background: "#D4AF37",
              color: "#2b1b35",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 900,
            }}
          >
            {totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "min(330px, calc(100vw - 32px))",
            background: "white",
            border: "1px solid #e5dce9",
            borderRadius: "13px",
            boxShadow: "0 14px 35px rgba(39,20,52,.18)",
            overflow: "hidden",
            zIndex: 1000,
            color: "#21152a",
          }}
        >
          <div
            style={{
              padding: "13px 15px 10px",
              background: "#faf8fc",
              borderBottom: "1px solid #eee5f1",
            }}
          >
            <div
              style={{
                color: "#4B1678",
                fontSize: "12px",
                fontWeight: 900,
              }}
            >
              Help & Updates
            </div>
            <div
              style={{
                color: "#756b79",
                fontSize: "10px",
                lineHeight: 1.45,
                marginTop: "3px",
              }}
            >
              Quick help and your HairGrab communications in one place.
            </div>
          </div>

          <HelpMenuLink
            to="/seller/help"
            icon="?"
            title="How to Use Your Dashboard"
            text="A short seller guide for products, orders, financials and settings."
          />

          <HelpMenuLink
            to="/seller/messages"
            icon="✉"
            title="Messages"
            text="Private communication with HairGrab support."
            badge={unreadMessages > 0 ? String(unreadMessages) : undefined}
          />

          <HelpMenuLink
            to="/seller/notifications"
            icon="🔔"
            title="Notifications"
            text="Order, shipping, payout and marketplace alerts."
            badge={
              unreadNotifications > 0
                ? String(unreadNotifications)
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

function HelpMenuLink({
  to,
  icon,
  title,
  text,
  badge,
}: {
  to: string;
  icon: string;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      style={{
        display: "flex",
        gap: "11px",
        alignItems: "flex-start",
        padding: "13px 15px",
        textDecoration: "none",
        color: "inherit",
        borderBottom: "1px solid #f0e9f2",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          background: "#f2eafa",
          color: "#4B1678",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "13px",
          fontWeight: 900,
          flex: "0 0 auto",
        }}
      >
        {icon}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <span
            style={{
              color: "#4B1678",
              fontSize: "12px",
              fontWeight: 900,
            }}
          >
            {title}
          </span>
          {badge && (
            <span
              style={{
                minWidth: "20px",
                height: "20px",
                padding: "0 6px",
                borderRadius: "20px",
                background: "#4B1678",
                color: "white",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                fontWeight: 900,
              }}
            >
              {badge}
            </span>
          )}
        </span>
        <span
          style={{
            display: "block",
            color: "#756b79",
            fontSize: "10px",
            lineHeight: 1.45,
            marginTop: "3px",
          }}
        >
          {text}
        </span>
      </span>
    </Link>
  );
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

  const sellerInitials =
    seller.businessName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "HG";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fbf9fd",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#21152a",
        paddingBottom: "78px",
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          .hg-dashboard-header-inner {
            padding: 0 !important;
          }

          .hg-dashboard-logo {
            width: 210px !important;
            height: 76px !important;
          }

          .hg-dashboard-header-actions {
            gap: 7px !important;
          }

          .hg-desktop-only {
            display: none !important;
          }

          .hg-dashboard-main {
            padding: 22px 16px 32px !important;
          }

          .hg-welcome-row {
            align-items: flex-start !important;
            gap: 16px !important;
          }

          .hg-welcome-title {
            font-size: 28px !important;
            line-height: 1.05 !important;
          }

          .hg-add-product {
            padding: 12px 17px !important;
            font-size: 14px !important;
          }

          .hg-quick-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .hg-quick-stat {
            min-height: 96px !important;
            padding: 13px 10px !important;
          }

          .hg-quick-stat-value {
            font-size: 21px !important;
          }

          .hg-quick-stat-label {
            font-size: 10px !important;
          }

          .hg-store-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }

          .hg-store-tile {
            min-height: 156px !important;
            padding: 16px !important;
          }

          .hg-store-tile-title {
            font-size: 16px !important;
          }

          .hg-store-tile-text {
            font-size: 11px !important;
          }

          .hg-bottom-nav {
            display: grid !important;
          }
        }

        @media (min-width: 721px) {
          .hg-mobile-only {
            display: none !important;
          }
        }
      `}</style>

      <header
        style={{
          background: "#4B1678",
          color: "white",
          padding: "12px 18px",
          boxShadow: "0 4px 16px rgba(75, 22, 120, 0.12)",
        }}
      >
        <div
          className="hg-dashboard-header-inner"
          style={{
            maxWidth: "1180px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <Link
            to="/seller"
            aria-label="HairGrab Seller Dashboard home"
            style={{
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              minWidth: 0,
            }}
          >
            <img
              className="hg-dashboard-logo"
              src="/hairgrab-logo.png"
              alt="HairGrab - The Marketplace for Hair - Find It. Love It. Grab It."
              style={{
                width: "260px",
                maxWidth: "48vw",
                height: "88px",
                objectFit: "contain",
                display: "block",
                background: "white",
                borderRadius: "12px",
                padding: "4px 8px",
                boxSizing: "border-box",
              }}
            />
          </Link>

          <div
            className="hg-dashboard-header-actions"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "9px",
              flexShrink: 0,
            }}
          >
            <div className="hg-desktop-only">
              <OrderAlertController />
            </div>

            <HelpUpdatesMenu
              unreadMessages={stats.unreadMessages}
              unreadNotifications={stats.unreadNotifications}
            />

            <div
              title={seller.businessName}
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                background: "#D4AF37",
                color: "#4B1678",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "14px",
                border: "2px solid rgba(255,255,255,.82)",
              }}
            >
              {sellerInitials}
            </div>
          </div>
        </div>
      </header>

      <main
        className="hg-dashboard-main"
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "28px 20px 60px",
        }}
      >
        <section
          className="hg-welcome-row"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "18px",
            marginBottom: "24px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: "#756b79",
                fontSize: "15px",
                fontWeight: 700,
                marginBottom: "4px",
              }}
            >
              Welcome back,
            </div>

            <h1
              className="hg-welcome-title"
              style={{
                margin: 0,
                color: "#4B1678",
                fontSize: "34px",
                lineHeight: 1.08,
                fontWeight: 900,
                overflowWrap: "anywhere",
              }}
            >
              {seller.businessName}
            </h1>

            <div
              style={{
                marginTop: "6px",
                color: "#756b79",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.4px",
              }}
            >
              {seller.sellerCode}
            </div>
          </div>

          <Link
            className="hg-add-product"
            to="/seller/add-product"
            style={{
              background: "#4B1678",
              color: "white",
              textDecoration: "none",
              fontWeight: 900,
              fontSize: "14px",
              padding: "13px 19px",
              borderRadius: "11px",
              boxShadow: "0 6px 16px rgba(75, 22, 120, 0.18)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            + Add Product
          </Link>
        </section>

        <section
          className="hg-mobile-only"
          style={{
            marginBottom: "14px",
          }}
        >
          <OrderAlertController />
        </section>

        <section
          className="hg-quick-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "12px",
            marginBottom: "30px",
          }}
        >
          <QuickStat
            icon="▣"
            value={String(stats.activeProducts)}
            label="Products"
            to="/seller/products"
          />

          <QuickStat
            icon="🚚"
            value={String(stats.readyToShip)}
            label="Ready to Ship"
            to="/seller/orders"
          />

          <QuickStat
            icon="$"
            value={money(stats.payoutReady)}
            label="Payout Ready"
            to="/seller/financials"
            gold
          />
        </section>

        <section>
          <div
            style={{
              marginBottom: "15px",
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#4B1678",
                fontSize: "28px",
                lineHeight: 1.1,
                fontWeight: 900,
              }}
            >
              My Store
            </h2>

            <div
              style={{
                color: "#756b79",
                fontSize: "13px",
                marginTop: "5px",
              }}
            >
              Manage your products, orders and store all in one place.
            </div>
          </div>

          <div
            className="hg-store-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "14px",
            }}
          >
            <CompactStoreTile
              icon="◇"
              title="Products"
              text="Add, edit and manage your product listings."
              to="/seller/products"
            />

            <CompactStoreTile
              icon="🛒"
              title="Orders"
              text="View and manage your orders."
              to="/seller/orders"
              gold
            />

            <CompactStoreTile
              icon="▥"
              title="Sales & Earnings"
              text="Track your sales, fees and payouts."
              to="/seller/financials"
            />

            <CompactStoreTile
              icon="▰"
              title="Store Settings"
              text="Update your store info, fulfillment and shipping."
              to="/seller/settings"
            />

            <CompactStoreTile
              icon="★"
              title="Seller Picks"
              text="Manage your featured products."
              to="/seller/picks"
              gold
            />

            <CompactStoreTile
              icon="✦"
              title="Store Preview"
              text="See how shoppers view your HairGrab store."
              to="/seller/store-preview"
            />

            <CompactStoreTile
              icon="⇄"
              title="Shopify Catalog"
              text="Connect or review products from Shopify."
              to="/seller/shopify"
            />

            <CompactStoreTile
              icon="?"
              title="Help & Updates"
              text="Messages, notifications and dashboard help."
              to="/seller/help"
            />
          </div>
        </section>

        <section
          style={{
            marginTop: "28px",
            background: "white",
            border: "1px solid #e5dce9",
            borderRadius: "14px",
            padding: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "15px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  color: "#4B1678",
                  fontSize: "19px",
                }}
              >
                Financials
              </h2>

              <div
                style={{
                  color: "#756b79",
                  fontSize: "11px",
                  marginTop: "4px",
                }}
              >
                Sales, HairGrab fees, earnings and payout-ready balance.
              </div>
            </div>

            <Link
              to="/seller/financials"
              style={{
                background: "#4B1678",
                color: "white",
                fontSize: "12px",
                fontWeight: 800,
                textDecoration: "none",
                padding: "9px 12px",
                borderRadius: "8px",
              }}
            >
              View Financial Report
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
              gap: "16px",
            }}
          >
            <Financial
              label="Gross Sales"
              value={money(stats.grossSales)}
            />

            <Financial
              label="HairGrab Fee"
              value={money(stats.commission)}
            />

            <Financial
              label="Your Earnings"
              value={money(stats.sellerEarnings)}
            />

            <Financial
              label="Payout Ready"
              value={money(stats.payoutReady)}
            />
          </div>
        </section>
      </main>

      <nav
        className="hg-bottom-nav"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: "68px",
          background: "white",
          borderTop: "1px solid #e7deeb",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          alignItems: "stretch",
          zIndex: 1200,
          boxShadow: "0 -5px 20px rgba(45, 27, 54, 0.06)",
          display: "none",
        }}
      >
        <BottomNavItem
          to="/seller"
          icon="⌂"
          label="Home"
          active
        />

        <BottomNavItem
          to="/seller/products"
          icon="◇"
          label="Products"
        />

        <BottomNavItem
          to="/seller/orders"
          icon="🛒"
          label="Orders"
        />

        <BottomNavItem
          to="/seller/financials"
          icon="$"
          label="Payouts"
        />

        <BottomNavItem
          to="/seller/settings"
          icon="☰"
          label="More"
        />
      </nav>
    </div>
  );
}


function QuickStat({
  icon,
  value,
  label,
  to,
  gold,
}: {
  icon: string;
  value: string;
  label: string;
  to: string;
  gold?: boolean;
}) {
  return (
    <Link
      to={to}
      className="hg-quick-stat"
      style={{
        minHeight: "104px",
        background: "white",
        border: "1px solid #e7dceb",
        borderRadius: "15px",
        padding: "16px",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxSizing: "border-box",
        boxShadow: "0 4px 14px rgba(45,27,54,.04)",
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "42px",
          height: "42px",
          borderRadius: "11px",
          background: gold ? "#fbf4df" : "#f3ebf9",
          color: gold ? "#b88414" : "#4B1678",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: "19px",
          flex: "0 0 auto",
        }}
      >
        {icon}
      </span>

      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          className="hg-quick-stat-value"
          style={{
            display: "block",
            color: "#21152a",
            fontSize: "24px",
            fontWeight: 900,
            lineHeight: 1.05,
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </span>

        <span
          className="hg-quick-stat-label"
          style={{
            display: "block",
            color: "#756b79",
            fontSize: "12px",
            marginTop: "4px",
            lineHeight: 1.15,
          }}
        >
          {label}
        </span>
      </span>

      <span
        aria-hidden="true"
        style={{
          color: "#4B1678",
          fontSize: "20px",
          fontWeight: 900,
          flex: "0 0 auto",
        }}
      >
        ›
      </span>
    </Link>
  );
}


function CompactStoreTile({
  icon,
  title,
  text,
  to,
  gold,
}: {
  icon: string;
  title: string;
  text: string;
  to: string;
  gold?: boolean;
}) {
  return (
    <Link
      to={to}
      className="hg-store-tile"
      style={{
        minHeight: "145px",
        background: "white",
        border: "1px solid #e7dceb",
        borderRadius: "15px",
        padding: "18px",
        boxSizing: "border-box",
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        gap: "13px",
        alignItems: "flex-start",
        boxShadow: "0 4px 14px rgba(45,27,54,.035)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "46px",
          height: "46px",
          borderRadius: "12px",
          background: gold ? "#fbf4df" : "#f3ebf9",
          color: gold ? "#b88414" : "#4B1678",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
          fontWeight: 900,
          fontSize: "21px",
        }}
      >
        {icon}
      </span>

      <span
        style={{
          minWidth: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <span
          className="hg-store-tile-title"
          style={{
            color: "#21152a",
            fontSize: "17px",
            fontWeight: 900,
            lineHeight: 1.15,
          }}
        >
          {title}
        </span>

        <span
          className="hg-store-tile-text"
          style={{
            color: "#756b79",
            fontSize: "12px",
            lineHeight: 1.4,
            marginTop: "7px",
          }}
        >
          {text}
        </span>
      </span>

      <span
        aria-hidden="true"
        style={{
          color: "#4B1678",
          fontSize: "22px",
          fontWeight: 900,
          alignSelf: "center",
          flex: "0 0 auto",
        }}
      >
        ›
      </span>
    </Link>
  );
}


function BottomNavItem({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      to={to}
      style={{
        textDecoration: "none",
        color: active ? "#4B1678" : "#5f5869",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "3px",
        fontSize: "10px",
        fontWeight: active ? 900 : 700,
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: "21px",
          lineHeight: 1,
          fontWeight: 900,
        }}
      >
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}


// ==========================================================
// STORE TILE
// ==========================================================

function StoreTile({
  title,
  value,
  text,
  to,
  badge,
}: {
  title: string;
  value: string;
  text: string;
  to: string;
  badge?: string;
}) {
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

          minHeight:
            "135px",

          boxSizing:
            "border-box",

          cursor:
            "pointer",
        }}
      >
        <div
          style={{
            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "start",

            gap:
              "8px",
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


          {badge && (
            <span
              style={{
                background:
                  "#4B1678",

                color:
                  "white",

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


        <div
          style={{
            color:
              "#4B1678",

            fontSize:
              "10px",

            fontWeight:
              "800",

            marginTop:
              "11px",
          }}
        >
          Open →
        </div>
      </div>
    </Link>
  );
}


// ==========================================================
// FINANCIAL
// ==========================================================

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