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
          <Link
            to="/seller"
            aria-label="HairGrab Seller Dashboard home"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "12px",
              textDecoration: "none",
              color: "white",
              minWidth: 0,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "white",
                borderRadius: "14px",
                padding: "10px 14px",
                flex: "0 0 auto",
              }}
            >
              <img
                src="/hairgrab-logo.png"
                alt="HairGrab"
                style={{
                  width: "280px",
                  maxWidth: "62vw",
                  height: "92px",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </span>

            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: "9px",
                  fontWeight: 800,
                  letterSpacing: "1px",
                  opacity: 0.82,
                }}
              >
                SELLER PORTAL
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "20px",
                  fontWeight: 800,
                  marginTop: "2px",
                  whiteSpace: "nowrap",
                }}
              >
                Seller Dashboard
              </span>
            </span>
          </Link>


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

              justifyContent:
                "flex-end",
            }}
          >
            <OrderAlertController />

            <HelpUpdatesMenu
              unreadMessages={stats.unreadMessages}
              unreadNotifications={stats.unreadNotifications}
            />

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
                "5px 0",

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
              text="Add, edit and manage your HairGrab product listings."
              to="/seller/products"
            />

            <StoreTile
              title="Orders & Shipping"
              value={`${stats.readyToShip} Ready to Ship`}
              text={`${stats.shipped} Shipped · ${stats.delivered} Delivered · ${stats.totalOrders} Total`}
              to="/seller/orders"
            />

            <StoreTile
              title="Shopify Catalog"
              value="Connect or Review"
              text="Connect a Shopify store and review products available for HairGrab import."
              to="/seller/shopify"
            />

            <StoreTile
              title="Seller Picks"
              value="Choose up to 5"
              text="Select the products you want eligible for HairGrab homepage rotation."
              to="/seller/picks"
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
                Your HairGrab sales, marketplace fees, earnings and payout-ready balance.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
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
                View / Export Financial Report
              </Link>
              <Link
                to="/seller/help"
                style={{
                  color: "#4B1678",
                  fontSize: "11px",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                What do these mean? →
              </Link>
            </div>
          </div>


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