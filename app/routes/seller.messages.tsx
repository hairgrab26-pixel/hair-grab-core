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
import { requireSellerSession } from "../seller-session.server";


// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  // Every seller gets one permanent private conversation
  // with HairGrab support.
  const conversation =
    await db.sellerConversation.upsert({
      where: {
        sellerId:
          seller.id,
      },

      update: {},

      create: {
        sellerId:
          seller.id,

        subject:
          "HairGrab Support",

        status:
          "OPEN",
      },
    });


  // Opening the inbox means the seller has seen
  // any HairGrab replies that were still unread.
  await db.sellerMessage.updateMany({
    where: {
      conversationId:
        conversation.id,

      senderType:
        "HAIRGRAB",

      readBySellerAt:
        null,
    },

    data: {
      readBySellerAt:
        new Date(),
    },
  });


  const messages =
    await db.sellerMessage.findMany({
      where: {
        conversationId:
          conversation.id,
      },

      orderBy: {
        createdAt:
          "asc",
      },

      select: {
        id:
          true,

        senderType:
          true,

        senderName:
          true,

        body:
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

      contactFirstName:
        seller.contactFirstName ||
        "",
    },

    conversation: {
      id:
        conversation.id,

      status:
        conversation.status,

      subject:
        conversation.subject,
    },

    messages:
      messages.map(
        (
          message,
        ) => ({
          ...message,

          createdAt:
            message.createdAt.toISOString(),
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
  const { seller } =
    await requireSellerSession(
      request,
    );

  const formData =
    await request.formData();


  const body =
    String(
      formData.get(
        "body",
      ) ||
        "",
    ).trim();


  if (!body) {
    return redirect(
      "/seller/messages",
    );
  }


  if (
    body.length >
    4000
  ) {
    throw new Response(
      "Message is too long.",
      {
        status: 400,
      },
    );
  }


  const conversation =
    await db.sellerConversation.upsert({
      where: {
        sellerId:
          seller.id,
      },

      update: {
        status:
          "OPEN",
      },

      create: {
        sellerId:
          seller.id,

        subject:
          "HairGrab Support",

        status:
          "OPEN",
      },
    });


  const now =
    new Date();


  await db.$transaction([
    db.sellerMessage.create({
      data: {
        conversationId:
          conversation.id,

        senderType:
          "SELLER",

        senderName:
          seller.contactFirstName ||
          seller.businessName,

        body,

        // The seller obviously knows the message
        // they just sent.
        readBySellerAt:
          now,

        // HairGrab has not read it yet.
        readByHairGrabAt:
          null,
      },
    }),

    db.sellerConversation.update({
      where: {
        id:
          conversation.id,
      },

      data: {
        lastMessageAt:
          now,

        status:
          "OPEN",
      },
    }),
  ]);


  return redirect(
    "/seller/messages",
  );
};


// ==========================================================
// PAGE
// ==========================================================

export default function SellerMessagesPage() {
  const {
    seller,
    conversation,
    messages,
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
          "28px 18px 70px",

        fontFamily:
          "Arial, sans-serif",

        color:
          "#21152a",
      }}
    >
      <div
        style={{
          maxWidth:
            "820px",

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
            background:
              "#ffffff",

            border:
              "1px solid #e5dce9",

            borderRadius:
              "16px",

            marginTop:
              "12px",

            overflow:
              "hidden",
          }}
        >
          {/* HEADER */}

          <div
            style={{
              padding:
                "22px 24px",

              borderBottom:
                "1px solid #eee7f2",

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

                  textTransform:
                    "uppercase",
                }}
              >
                HairGrab Seller Support
              </div>


              <h1
                style={{
                  color:
                    "#4B1678",

                  margin:
                    "5px 0 3px",

                  fontSize:
                    "26px",
                }}
              >
                Messages
              </h1>


              <div
                style={{
                  color:
                    "#756b79",

                  fontSize:
                    "12px",
                }}
              >
                Private conversation between{" "}
                <strong>
                  {seller.businessName}
                </strong>{" "}
                and HairGrab.
              </div>
            </div>


            <div
              style={{
                background:
                  "#edf8ef",

                color:
                  "#28743b",

                borderRadius:
                  "20px",

                padding:
                  "7px 10px",

                fontSize:
                  "10px",

                fontWeight:
                  "800",
              }}
            >
              {conversation.status ===
              "OPEN"
                ? "● Open"
                : "Closed"}
            </div>
          </div>


          {/* MESSAGE AREA */}

          <div
            style={{
              background:
                "#fbf9fc",

              padding:
                "22px",

              minHeight:
                "420px",

              maxHeight:
                "600px",

              overflowY:
                "auto",
            }}
          >
            {messages.length ===
            0 ? (
              <div
                style={{
                  textAlign:
                    "center",

                  padding:
                    "75px 25px",

                  color:
                    "#817787",
                }}
              >
                <div
                  style={{
                    fontSize:
                      "34px",

                    marginBottom:
                      "12px",
                  }}
                >
                  💬
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
                  Need help?
                </div>

                <div
                  style={{
                    fontSize:
                      "12px",

                    lineHeight:
                      1.6,

                    marginTop:
                      "6px",
                  }}
                >
                  Send HairGrab a message below.
                  Your conversation stays here
                  in your seller account.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display:
                    "flex",

                  flexDirection:
                    "column",

                  gap:
                    "13px",
                }}
              >
                {messages.map(
                  (
                    message,
                  ) => {
                    const sellerMessage =
                      message.senderType ===
                      "SELLER";


                    return (
                      <div
                        key={
                          message.id
                        }
                        style={{
                          display:
                            "flex",

                          justifyContent:
                            sellerMessage
                              ? "flex-end"
                              : "flex-start",
                        }}
                      >
                        <div
                          style={{
                            maxWidth:
                              "76%",

                            background:
                              sellerMessage
                                ? "#4B1678"
                                : "#ffffff",

                            color:
                              sellerMessage
                                ? "#ffffff"
                                : "#2c2032",

                            border:
                              sellerMessage
                                ? "1px solid #4B1678"
                                : "1px solid #e5dce9",

                            borderRadius:
                              sellerMessage
                                ? "14px 14px 4px 14px"
                                : "14px 14px 14px 4px",

                            padding:
                              "11px 13px",

                            boxShadow:
                              "0 1px 2px rgba(0,0,0,.03)",
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                "10px",

                              fontWeight:
                                "800",

                              marginBottom:
                                "5px",

                              color:
                                sellerMessage
                                  ? "#eadcf2"
                                  : "#4B1678",
                            }}
                          >
                            {sellerMessage
                              ? message.senderName ||
                                seller.businessName
                              : "HairGrab Support"}
                          </div>


                          <div
                            style={{
                              fontSize:
                                "13px",

                              lineHeight:
                                1.55,

                              whiteSpace:
                                "pre-wrap",

                              overflowWrap:
                                "anywhere",
                            }}
                          >
                            {message.body}
                          </div>


                          <div
                            style={{
                              fontSize:
                                "9px",

                              marginTop:
                                "7px",

                              color:
                                sellerMessage
                                  ? "#d9c7e4"
                                  : "#938a97",

                              textAlign:
                                "right",
                            }}
                          >
                            {formatMessageTime(
                              message.createdAt,
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>


          {/* COMPOSER */}

          <Form
            method="post"
            style={{
              borderTop:
                "1px solid #eee7f2",

              padding:
                "18px 20px",

              background:
                "#ffffff",
            }}
          >
            <label>
              <div
                style={{
                  color:
                    "#4B1678",

                  fontSize:
                    "11px",

                  fontWeight:
                    "800",

                  marginBottom:
                    "7px",
                }}
              >
                Message HairGrab
              </div>


              <textarea
                name="body"
                required
                maxLength={
                  4000
                }
                rows={
                  4
                }
                placeholder="Type your message here..."
                style={{
                  width:
                    "100%",

                  boxSizing:
                    "border-box",

                  border:
                    "1px solid #d8cce0",

                  borderRadius:
                    "10px",

                  padding:
                    "12px",

                  background:
                    "#ffffff",

                  resize:
                    "vertical",

                  minHeight:
                    "90px",

                  fontFamily:
                    "Arial, sans-serif",

                  fontSize:
                    "13px",

                  lineHeight:
                    1.5,

                  outline:
                    "none",
                }}
              />
            </label>


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

                marginTop:
                  "10px",

                flexWrap:
                  "wrap",
              }}
            >
              <div
                style={{
                  color:
                    "#938a97",

                  fontSize:
                    "10px",
                }}
              >
                HairGrab support can reply
                directly inside your seller
                account.
              </div>


              <button
                type="submit"
                style={{
                  border:
                    0,

                  background:
                    "#4B1678",

                  color:
                    "#ffffff",

                  borderRadius:
                    "9px",

                  padding:
                    "11px 18px",

                  fontWeight:
                    "800",

                  cursor:
                    "pointer",
                }}
              >
                Send Message
              </button>
            </div>
          </Form>
        </div>


        <div
          style={{
            marginTop:
              "12px",

            textAlign:
              "center",

            color:
              "#938a97",

            fontSize:
              "10px",
          }}
        >
          Seller ID: {seller.sellerCode}
          {" · "}
          Messages are private between your
          business and HairGrab.
        </div>
      </div>
    </div>
  );
}


// ==========================================================
// HELPERS
// ==========================================================

function formatMessageTime(
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