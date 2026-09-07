import type {
  LoaderFunctionArgs,
} from "react-router";

import {
  Link,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import {
  authenticate,
} from "../shopify.server";

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  await authenticate.admin(
    request,
  );

  const conversations =
    await db.sellerConversation.findMany({
      include: {
        seller: {
          select: {
            sellerCode:
              true,

            businessName:
              true,

            email:
              true,
          },
        },

        messages: {
          orderBy: {
            createdAt:
              "desc",
          },

          take:
            1,
        },
      },

      orderBy: [
        {
          lastMessageAt:
            "desc",
        },

        {
          updatedAt:
            "desc",
        },
      ],
    });

  const rows =
    await Promise.all(
      conversations.map(
        async (
          conversation,
        ) => {
          const unread =
            await db.sellerMessage.count({
              where: {
                conversationId:
                  conversation.id,

                senderType:
                  "SELLER",

                readByHairGrabAt:
                  null,
              },
            });

          const lastMessage =
            conversation
              .messages[0];

          return {
            id:
              conversation.id,

            sellerCode:
              conversation
                .seller
                .sellerCode,

            businessName:
              conversation
                .seller
                .businessName,

            email:
              conversation
                .seller
                .email ||
              "",

            status:
              conversation.status,

            unread,

            lastMessage:
              lastMessage
                ?.body ||
              "",

            lastSender:
              lastMessage
                ?.senderType ||
              "",

            lastMessageAt:
              lastMessage
                ?.createdAt
                .toISOString() ||
              conversation
                .lastMessageAt
                ?.toISOString() ||
              conversation
                .updatedAt
                .toISOString(),
          };
        },
      ),
    );

  const totalUnread =
    rows.reduce(
      (
        total,
        row,
      ) =>
        total +
        row.unread,

      0,
    );

  return {
    conversations:
      rows,

    totalUnread,
  };
};

function formatDate(
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

export default function Communications() {
  const {
    conversations,
    totalUnread,
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

        padding:
          "28px 20px 70px",

        fontFamily:
          "Arial, Helvetica, sans-serif",

        color:
          "#21152a",
      }}
    >
      <div
        style={{
          maxWidth:
            "1050px",

          margin:
            "0 auto",
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
              "15px",

            flexWrap:
              "wrap",

            marginBottom:
              "20px",
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
              HAIRGRAB CORE
            </div>

            <h1
              style={{
                color:
                  "#542378",

                margin:
                  "5px 0",

                fontSize:
                  "30px",
              }}
            >
              Communications
            </h1>

            <div
              style={{
                color:
                  "#756b7b",

                fontSize:
                  "12px",
              }}
            >
              Private seller support conversations.
            </div>
          </div>

          <div
            style={{
              background:
                totalUnread >
                0
                  ? "#542378"
                  : "#edf8ef",

              color:
                totalUnread >
                0
                  ? "white"
                  : "#28743b",

              borderRadius:
                "20px",

              padding:
                "8px 12px",

              fontSize:
                "11px",

              fontWeight:
                "800",
            }}
          >
            {totalUnread} Unread
          </div>
        </div>

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
          <div
            style={{
              padding:
                "18px 20px",

              borderBottom:
                "1px solid #eee7f2",
            }}
          >
            <div
              style={{
                color:
                  "#542378",

                fontSize:
                  "19px",

                fontWeight:
                  "800",
              }}
            >
              Seller Inbox
            </div>

            <div
              style={{
                color:
                  "#756b7b",

                fontSize:
                  "11px",

                marginTop:
                  "4px",
              }}
            >
              Messages sent by HairGrab sellers appear here.
            </div>
          </div>

          {conversations.length ===
          0 ? (
            <div
              style={{
                textAlign:
                  "center",

                padding:
                  "65px 20px",

                color:
                  "#8a7f90",

                fontSize:
                  "12px",
              }}
            >
              No seller messages yet.
            </div>
          ) : (
            conversations.map(
              (
                conversation,
              ) => (
                <Link
                  key={
                    conversation.id
                  }
                  to={`/app/communications/${encodeURIComponent(
                    conversation.sellerCode,
                  )}`}
                  style={{
                    display:
                      "block",

                    padding:
                      "17px 20px",

                    borderBottom:
                      "1px solid #eee7f2",

                    textDecoration:
                      "none",

                    color:
                      "inherit",

                    background:
                      conversation.unread >
                      0
                        ? "#faf6fd"
                        : "white",
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
                        "12px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color:
                            "#542378",

                          fontWeight:
                            "800",

                          fontSize:
                            "15px",
                        }}
                      >
                        {
                          conversation.businessName
                        }
                      </div>

                      <div
                        style={{
                          color:
                            "#8a7f90",

                          fontSize:
                            "10px",

                          marginTop:
                            "3px",
                        }}
                      >
                        {
                          conversation.sellerCode
                        }

                        {conversation.email
                          ? ` · ${conversation.email}`
                          : ""}
                      </div>
                    </div>

                    {conversation.unread >
                      0 && (
                      <div
                        style={{
                          background:
                            "#542378",

                          color:
                            "white",

                          borderRadius:
                            "20px",

                          minWidth:
                            "22px",

                          height:
                            "22px",

                          padding:
                            "0 6px",

                          display:
                            "flex",

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
                        {
                          conversation.unread
                        }
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      color:
                        "#5f5664",

                      fontSize:
                        "12px",

                      marginTop:
                        "10px",

                      overflow:
                        "hidden",

                      textOverflow:
                        "ellipsis",

                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    {conversation.lastSender ===
                    "SELLER"
                      ? "Seller: "
                      : conversation.lastSender ===
                          "HAIRGRAB"
                        ? "HairGrab: "
                        : ""}

                    {
                      conversation.lastMessage
                    }
                  </div>

                  <div
                    style={{
                      color:
                        "#9a919e",

                      fontSize:
                        "9px",

                      marginTop:
                        "6px",
                    }}
                  >
                    {formatDate(
                      conversation.lastMessageAt,
                    )}
                  </div>
                </Link>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}