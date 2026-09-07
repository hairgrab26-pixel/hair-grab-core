import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  redirect,
  useLoaderData,
} from "react-router";

import db from "../db.server";

import {
  requireSellerSession,
} from "../seller-session.server";

import {
  syncSellerNotifications,
} from "../notifications.server";


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


  // Synchronize HairGrab marketplace events
  // into the seller notification center.
  await syncSellerNotifications(
    seller.id,
  );


  const notifications =
    await db.sellerNotification.findMany({
      where: {
        sellerId:
          seller.id,
      },

      orderBy: {
        createdAt:
          "desc",
      },

      take:
        100,

      select: {
        id:
          true,

        type:
          true,

        title:
          true,

        message:
          true,

        linkUrl:
          true,

        readAt:
          true,

        createdAt:
          true,
      },
    });


  return {
    seller: {
      businessName:
        seller.businessName,

      sellerCode:
        seller.sellerCode,
    },

    notifications:
      notifications.map(
        (
          notification,
        ) => ({
          ...notification,

          readAt:
            notification.readAt
              ? notification.readAt.toISOString()
              : null,

          createdAt:
            notification.createdAt.toISOString(),
        }),
      ),
  };
};


// ==========================================================
// ACTION
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const {
    seller,
  } =
    await requireSellerSession(
      request,
    );


  const formData =
    await request.formData();


  const intent =
    String(
      formData.get(
        "intent",
      ) || "",
    );


  // ========================================================
  // MARK ALL READ
  // ========================================================

  if (
    intent ===
    "mark-all-read"
  ) {
    await db.sellerNotification.updateMany({
      where: {
        sellerId:
          seller.id,

        readAt:
          null,
      },

      data: {
        readAt:
          new Date(),
      },
    });


    return redirect(
      "/seller/notifications",
    );
  }


  // ========================================================
  // MARK ONE READ
  // ========================================================

  if (
    intent ===
    "mark-one-read"
  ) {
    const notificationId =
      String(
        formData.get(
          "notificationId",
        ) || "",
      );


    if (
      notificationId
    ) {
      await db.sellerNotification.updateMany({
        where: {
          id:
            notificationId,

          sellerId:
            seller.id,
        },

        data: {
          readAt:
            new Date(),
        },
      });
    }


    return redirect(
      "/seller/notifications",
    );
  }


  return redirect(
    "/seller/notifications",
  );
};


// ==========================================================
// PAGE
// ==========================================================

export default function SellerNotificationsPage() {
  const {
    seller,
    notifications,
  } =
    useLoaderData<
      typeof loader
    >();


  const unreadCount =
    notifications.filter(
      (
        notification,
      ) =>
        !notification.readAt,
    ).length;


  return (
    <div
      style={{
        minHeight:
          "100vh",

        background:
          "#faf8fc",

        padding:
          "28px 18px 70px",

        fontFamily:
          "Arial, Helvetica, sans-serif",

        color:
          "#21152a",
      }}
    >
      <div
        style={{
          maxWidth:
            "900px",

          margin:
            "0 auto",
        }}
      >
        <Link
          to="/seller"
          style={{
            color:
              "#4B1678",

            textDecoration:
              "none",

            fontWeight:
              "800",

            fontSize:
              "12px",
          }}
        >
          ← Back to Dashboard
        </Link>


        <div
          style={{
            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap:
              "15px",

            flexWrap:
              "wrap",

            marginTop:
              "17px",

            marginBottom:
              "15px",
          }}
        >
          <div>
            <div
              style={{
                color:
                  "#7b3fa0",

                fontSize:
                  "10px",

                fontWeight:
                  "800",

                letterSpacing:
                  "1px",
              }}
            >
              {seller.sellerCode}
            </div>


            <h1
              style={{
                color:
                  "#4B1678",

                margin:
                  "4px 0",

                fontSize:
                  "29px",
              }}
            >
              Notifications
            </h1>


            <div
              style={{
                color:
                  "#756b79",

                fontSize:
                  "12px",
              }}
            >
              Marketplace alerts for {seller.businessName}.
            </div>
          </div>


          <Form
            method="post"
          >
            <input
              type="hidden"
              name="intent"
              value="mark-all-read"
            />

            <button
              type="submit"
              disabled={
                unreadCount ===
                0
              }
              style={{
                border:
                  0,

                background:
                  unreadCount >
                  0
                    ? "#4B1678"
                    : "#ddd5e2",

                color:
                  unreadCount >
                  0
                    ? "white"
                    : "#817787",

                borderRadius:
                  "8px",

                padding:
                  "10px 14px",

                fontWeight:
                  "800",

                cursor:
                  unreadCount >
                  0
                    ? "pointer"
                    : "default",
              }}
            >
              Mark All Read
            </button>
          </Form>
        </div>


        {/* SUMMARY */}

        <div
          style={{
            background:
              unreadCount >
              0
                ? "#f2eafa"
                : "#edf8ef",

            border:
              unreadCount >
              0
                ? "1px solid #dfcce9"
                : "1px solid #d5ead9",

            borderRadius:
              "10px",

            padding:
              "11px 14px",

            color:
              unreadCount >
              0
                ? "#4B1678"
                : "#28743b",

            fontSize:
              "12px",

            fontWeight:
              "800",

            marginBottom:
              "12px",
          }}
        >
          {unreadCount} unread notification
          {unreadCount ===
          1
            ? ""
            : "s"}
        </div>


        {/* NOTIFICATIONS */}

        <div
          style={{
            background:
              "white",

            border:
              "1px solid #e5dce9",

            borderRadius:
              "14px",

            overflow:
              "hidden",
          }}
        >
          {notifications.length ===
          0 ? (
            <div
              style={{
                textAlign:
                  "center",

                padding:
                  "70px 25px",

                color:
                  "#817787",
              }}
            >
              <div
                style={{
                  fontSize:
                    "34px",

                  marginBottom:
                    "10px",
                }}
              >
                🔔
              </div>


              <div
                style={{
                  color:
                    "#4B1678",

                  fontWeight:
                    "800",

                  fontSize:
                    "16px",
                }}
              >
                You're all caught up.
              </div>


              <div
                style={{
                  fontSize:
                    "12px",

                  marginTop:
                    "6px",
                }}
              >
                HairGrab alerts will appear here.
              </div>
            </div>
          ) : (
            notifications.map(
              (
                notification,
              ) => (
                <div
                  key={
                    notification.id
                  }
                  style={{
                    display:
                      "flex",

                    justifyContent:
                      "space-between",

                    alignItems:
                      "center",

                    gap:
                      "15px",

                    padding:
                      "17px 18px",

                    borderBottom:
                      "1px solid #eee7f2",

                    background:
                      notification.readAt
                        ? "#ffffff"
                        : "#fbf7fe",
                  }}
                >
                  <div
                    style={{
                      flex:
                        1,

                      minWidth:
                        0,
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",

                        alignItems:
                          "center",

                        gap:
                          "6px",

                        flexWrap:
                          "wrap",
                      }}
                    >
                      <span
                        style={{
                          background:
                            typeBackground(
                              notification.type,
                            ),

                          color:
                            typeColor(
                              notification.type,
                            ),

                          borderRadius:
                            "20px",

                          padding:
                            "4px 7px",

                          fontSize:
                            "8px",

                          fontWeight:
                            "800",
                        }}
                      >
                        {typeLabel(
                          notification.type,
                        )}
                      </span>


                      {!notification.readAt && (
                        <span
                          style={{
                            background:
                              "#4B1678",

                            color:
                              "white",

                            borderRadius:
                              "20px",

                            padding:
                              "4px 7px",

                            fontSize:
                              "8px",

                            fontWeight:
                              "800",
                          }}
                        >
                          NEW
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
                          "9px",
                      }}
                    >
                      {notification.title}
                    </div>


                    <div
                      style={{
                        color:
                          "#756b79",

                        fontSize:
                          "12px",

                        lineHeight:
                          1.5,

                        marginTop:
                          "5px",

                        whiteSpace:
                          "pre-wrap",

                        overflowWrap:
                          "anywhere",
                      }}
                    >
                      {notification.message}
                    </div>


                    <div
                      style={{
                        color:
                          "#9a919e",

                        fontSize:
                          "9px",

                        marginTop:
                          "7px",
                      }}
                    >
                      {formatNotificationDate(
                        notification.createdAt,
                      )}
                    </div>
                  </div>


                  <div
                    style={{
                      display:
                        "flex",

                      flexDirection:
                        "column",

                      gap:
                        "8px",

                      alignItems:
                        "flex-end",

                      flexShrink:
                        0,
                    }}
                  >
                    {!notification.readAt && (
                      <Form
                        method="post"
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="mark-one-read"
                        />

                        <input
                          type="hidden"
                          name="notificationId"
                          value={
                            notification.id
                          }
                        />

                        <button
                          type="submit"
                          style={{
                            border:
                              "1px solid #cdb9db",

                            background:
                              "white",

                            color:
                              "#4B1678",

                            borderRadius:
                              "7px",

                            padding:
                              "7px 9px",

                            fontSize:
                              "9px",

                            fontWeight:
                              "800",

                            cursor:
                              "pointer",
                          }}
                        >
                          Mark Read
                        </button>
                      </Form>
                    )}


                    {notification.linkUrl && (
                      <Link
                        to={
                          notification.linkUrl
                        }
                        style={{
                          color:
                            "#4B1678",

                          textDecoration:
                            "none",

                          fontWeight:
                            "800",

                          fontSize:
                            "10px",
                        }}
                      >
                        Open →
                      </Link>
                    )}
                  </div>
                </div>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}


// ==========================================================
// HELPERS
// ==========================================================

function formatNotificationDate(
  value: string,
) {
  return new Date(
    value,
  ).toLocaleString(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    },
  );
}


function typeLabel(
  type: string,
) {
  switch (
    String(
      type,
    ).toUpperCase()
  ) {
    case "NEW_MESSAGE":
      return "MESSAGE";

    case "NEW_ORDER":
      return "ORDER";

    case "SHIPPING":
      return "SHIPPING";

    case "DELIVERED":
      return "DELIVERED";

    case "PAYOUT_READY":
      return "PAYOUT";

    default:
      return "HAIRGRAB";
  }
}


function typeBackground(
  type: string,
) {
  switch (
    String(
      type,
    ).toUpperCase()
  ) {
    case "PAYOUT_READY":
      return "#edf8ef";

    case "SHIPPING":
    case "DELIVERED":
      return "#eef5fb";

    case "NEW_ORDER":
      return "#fff7e7";

    default:
      return "#f2eafa";
  }
}


function typeColor(
  type: string,
) {
  switch (
    String(
      type,
    ).toUpperCase()
  ) {
    case "PAYOUT_READY":
      return "#28743b";

    case "SHIPPING":
    case "DELIVERED":
      return "#315f89";

    case "NEW_ORDER":
      return "#8b651d";

    default:
      return "#6d447e";
  }
}