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
  authenticate,
} from "../shopify.server";

async function getSeller(
  sellerCode:
    string |
    undefined,
) {
  if (!sellerCode) {
    throw new Response(
      "Seller code is required.",
      {
        status:
          400,
      },
    );
  }

  const seller =
    await db.seller.findUnique({
      where: {
        sellerCode,
      },

      select: {
        id:
          true,

        sellerCode:
          true,

        businessName:
          true,

        email:
          true,

        status:
          true,
      },
    });

  if (!seller) {
    throw new Response(
      "Seller not found.",
      {
        status:
          404,
      },
    );
  }

  return seller;
}

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs) => {
  await authenticate.admin(
    request,
  );

  const seller =
    await getSeller(
      params.sellerCode,
    );

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

  await db.sellerMessage.updateMany({
    where: {
      conversationId:
        conversation.id,

      senderType:
        "SELLER",

      readByHairGrabAt:
        null,
    },

    data: {
      readByHairGrabAt:
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
    seller,

    conversation: {
      id:
        conversation.id,

      status:
        conversation.status,
    },

    messages:
      messages.map(
        (
          message,
        ) => ({
          ...message,

          createdAt:
            message
              .createdAt
              .toISOString(),
        }),
      ),
  };
};

export const action = async ({
  request,
  params,
}: ActionFunctionArgs) => {
  await authenticate.admin(
    request,
  );

  const seller =
    await getSeller(
      params.sellerCode,
    );

  const formData =
    await request.formData();

  const body =
    String(
      formData.get(
        "body",
      ) || "",
    ).trim();

  if (!body) {
    return redirect(
      `/app/communications/${encodeURIComponent(
        seller.sellerCode,
      )}`,
    );
  }

  if (
    body.length >
    4000
  ) {
    throw new Response(
      "Message is too long.",
      {
        status:
          400,
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
          "HAIRGRAB",

        senderName:
          "HairGrab Support",

        body,

        readByHairGrabAt:
          now,

        readBySellerAt:
          null,
      },
    }),

    db.sellerConversation.update({
      where: {
        id:
          conversation.id,
      },

      data: {
        status:
          "OPEN",

        lastMessageAt:
          now,
      },
    }),
  ]);

  return redirect(
    `/app/communications/${encodeURIComponent(
      seller.sellerCode,
    )}`,
  );
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

export default function SellerConversation() {
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
          to="/app/communications"
          style={{
            color:
              "#542378",

            textDecoration:
              "none",

            fontWeight:
              "800",

            fontSize:
              "12px",
          }}
        >
          ← Back to Communications
        </Link>

        <div
          style={{
            background:
              "white",

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
          <div
            style={{
              padding:
                "20px 22px",

              borderBottom:
                "1px solid #eee7f2",

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
              <div
                style={{
                  color:
                    "#7b3fa0",

                  fontSize:
                    "9px",

                  fontWeight:
                    "800",

                  letterSpacing:
                    "1px",
                }}
              >
                HAIRGRAB SELLER SUPPORT
              </div>

              <h1
                style={{
                  margin:
                    "4px 0",

                  color:
                    "#542378",

                  fontSize:
                    "25px",
                }}
              >
                {seller.businessName}
              </h1>

              <div
                style={{
                  color:
                    "#756b79",

                  fontSize:
                    "11px",
                }}
              >
                {seller.sellerCode}

                {seller.email
                  ? ` · ${seller.email}`
                  : ""}

                {` · ${seller.status}`}
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
                  "6px 9px",

                fontSize:
                  "9px",

                fontWeight:
                  "800",
              }}
            >
              ● {conversation.status}
            </div>
          </div>

          <div
            style={{
              background:
                "#fbf9fc",

              minHeight:
                "420px",

              maxHeight:
                "620px",

              overflowY:
                "auto",

              padding:
                "20px",
            }}
          >
            {messages.length ===
            0 ? (
              <div
                style={{
                  textAlign:
                    "center",

                  color:
                    "#8a7f90",

                  fontSize:
                    "12px",

                  padding:
                    "90px 20px",
                }}
              >
                No messages yet.
              </div>
            ) : (
              messages.map(
                (
                  message,
                ) => {
                  const fromHairGrab =
                    message.senderType ===
                    "HAIRGRAB";

                  return (
                    <div
                      key={
                        message.id
                      }
                      style={{
                        display:
                          "flex",

                        justifyContent:
                          fromHairGrab
                            ? "flex-end"
                            : "flex-start",

                        marginBottom:
                          "12px",
                      }}
                    >
                      <div
                        style={{
                          maxWidth:
                            "76%",

                          borderRadius:
                            "13px",

                          padding:
                            "10px 12px",

                          background:
                            fromHairGrab
                              ? "#542378"
                              : "#ffffff",

                          color:
                            fromHairGrab
                              ? "white"
                              : "#21152a",

                          border:
                            fromHairGrab
                              ? "1px solid #542378"
                              : "1px solid #e5dce9",
                        }}
                      >
                        <div
                          style={{
                            fontSize:
                              "9px",

                            fontWeight:
                              "800",

                            marginBottom:
                              "5px",

                            color:
                              fromHairGrab
                                ? "#eadcf2"
                                : "#542378",
                          }}
                        >
                          {fromHairGrab
                            ? "HairGrab Support"
                            : message.senderName ||
                              seller.businessName}
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
                            marginTop:
                              "6px",

                            fontSize:
                              "8px",

                            textAlign:
                              "right",

                            color:
                              fromHairGrab
                                ? "#d9c7e4"
                                : "#938a97",
                          }}
                        >
                          {formatDate(
                            message.createdAt,
                          )}
                        </div>
                      </div>
                    </div>
                  );
                },
              )
            )}
          </div>

          <Form
            method="post"
            style={{
              borderTop:
                "1px solid #eee7f2",

              padding:
                "17px 20px",
            }}
          >
            <label
              style={{
                display:
                  "block",

                color:
                  "#542378",

                fontSize:
                  "10px",

                fontWeight:
                  "800",
              }}
            >
              Reply as HairGrab Support

              <textarea
                name="body"
                required
                maxLength={4000}
                rows={4}
                placeholder="Type your reply..."
                style={{
                  width:
                    "100%",

                  boxSizing:
                    "border-box",

                  border:
                    "1px solid #d8cce0",

                  borderRadius:
                    "9px",

                  padding:
                    "11px",

                  marginTop:
                    "6px",

                  resize:
                    "vertical",

                  fontFamily:
                    "Arial, Helvetica, sans-serif",
                }}
              />
            </label>

            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "flex-end",

                marginTop:
                  "9px",
              }}
            >
              <button
                type="submit"
                style={{
                  border:
                    0,

                  background:
                    "#542378",

                  color:
                    "white",

                  borderRadius:
                    "8px",

                  padding:
                    "10px 16px",

                  fontWeight:
                    "800",

                  cursor:
                    "pointer",
                }}
              >
                Send Reply
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}