import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
} from "react-router";

import db from "../db.server";
import {
  requireSellerSession,
} from "../seller-session.server";

export const loader =
  async ({
    request,
  }: LoaderFunctionArgs) => {
    const {
      seller,
    } =
      await requireSellerSession(
        request,
      );

    const connection =
      await db
        .sellerShopifyConnection
        .findUnique({
          where: {
            sellerId:
              seller.id,
          },

          select: {
            shopDomain:
              true,
            shopName:
              true,
            status:
              true,
            scopes:
              true,
            connectedAt:
              true,
            lastSyncAt:
              true,
            disconnectedAt:
              true,
            lastError:
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

      connection,
    };
  };

export const action =
  async ({
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
        ) ||
        "",
      );

    if (
      intent !==
      "disconnect"
    ) {
      return {
        success:
          false,
        message:
          "Unknown action.",
      };
    }

    await db
      .sellerShopifyConnection
      .updateMany({
        where: {
          sellerId:
            seller.id,
        },

        data: {
          status:
            "DISCONNECTED",

          accessTokenEncrypted:
            null,

          disconnectedAt:
            new Date(),
        },
      });

    return {
      success:
        true,

      message:
        "Shopify store disconnected from HairGrab.",
    };
  };

function formatDate(
  value:
    Date |
    string |
    null |
    undefined,
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
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
  ).format(
    new Date(value),
  );
}

export default function SellerShopifyPage() {
  const {
    seller,
    connection,
  } =
    useLoaderData<
      typeof loader
    >();

  const actionData =
    useActionData<
      typeof action
    >();

  const connected =
    connection?.status ===
      "CONNECTED";

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
            "780px",
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
              800,
            fontSize:
              "12px",
          }}
        >
          ← Back to Dashboard
        </Link>

        <div
          style={{
            marginTop:
              "12px",
            background:
              "white",
            border:
              "1px solid #e6ddea",
            borderRadius:
              "18px",
            padding:
              "24px",
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
            }}
          >
            {seller.businessName} · {seller.sellerCode}
          </div>

          <h1
            style={{
              margin:
                "8px 0 6px",
              color:
                "#4B1678",
              fontSize:
                "28px",
            }}
          >
            Shopify Catalog Connection
          </h1>

          <p
            style={{
              margin:
                "0 0 20px",
              color:
                "#6d6172",
              lineHeight:
                1.6,
            }}
          >
            Connect your existing Shopify store so HairGrab can bring in your active products without rebuilding your catalog.
          </p>

          {actionData && (
            <div
              style={{
                padding:
                  "12px 14px",
                borderRadius:
                  "10px",
                marginBottom:
                  "16px",
                background:
                  actionData.success
                    ? "#eef8f0"
                    : "#fff1f1",
                color:
                  actionData.success
                    ? "#276236"
                    : "#9a2c2c",
                fontWeight:
                  700,
                fontSize:
                  "13px",
              }}
            >
              {actionData.message}
            </div>
          )}

          {connected ? (
            <>
              <div
                style={{
                  border:
                    "1px solid #d8eadc",
                  background:
                    "#f6fbf7",
                  borderRadius:
                    "14px",
                  padding:
                    "16px",
                }}
              >
                <div
                  style={{
                    fontWeight:
                      900,
                    color:
                      "#276236",
                    marginBottom:
                      "8px",
                  }}
                >
                  ✓ Shopify Connected
                </div>

                <div
                  style={{
                    fontSize:
                      "13px",
                    lineHeight:
                      1.8,
                  }}
                >
                  <strong>Store:</strong>{" "}
                  {connection.shopName ||
                    connection.shopDomain}
                  <br />

                  <strong>Shopify address:</strong>{" "}
                  {connection.shopDomain}
                  <br />

                  <strong>Connected:</strong>{" "}
                  {formatDate(
                    connection.connectedAt,
                  )}
                  <br />

                  <strong>Last catalog check:</strong>{" "}
                  {formatDate(
                    connection.lastSyncAt,
                  )}
                </div>
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "10px",
                  flexWrap:
                    "wrap",
                  marginTop:
                    "18px",
                }}
              >
                <Link
                  to="/seller/shopify/products"
                  style={{
                    display:
                      "inline-block",
                    background:
                      "#4B1678",
                    color:
                      "white",
                    textDecoration:
                      "none",
                    borderRadius:
                      "10px",
                    padding:
                      "11px 16px",
                    fontWeight:
                      800,
                  }}
                >
                  View Active Shopify Products
                </Link>

                <Form
                  method="post"
                >
                  <input
                    type="hidden"
                    name="intent"
                    value="disconnect"
                  />

                  <button
                    type="submit"
                    style={{
                      border:
                        "1px solid #d8cce0",
                      background:
                        "white",
                      color:
                        "#4B1678",
                      borderRadius:
                        "10px",
                      padding:
                        "10px 15px",
                      fontWeight:
                        800,
                      cursor:
                        "pointer",
                    }}
                  >
                    Disconnect Shopify
                  </button>
                </Form>
              </div>
            </>
          ) : (
            <Form
              action="/seller/shopify/connect"
              method="get"
            >
              <label
                style={{
                  display:
                    "block",
                  fontWeight:
                    800,
                  color:
                    "#4B1678",
                  marginBottom:
                    "7px",
                }}
              >
                Shopify store address
              </label>

              <input
                name="shop"
                type="text"
                required
                placeholder="your-store.myshopify.com"
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
                    "12px 13px",
                  fontSize:
                    "14px",
                }}
              />

              <div
                style={{
                  marginTop:
                    "7px",
                  fontSize:
                    "12px",
                  color:
                    "#756b79",
                }}
              >
                Use your permanent .myshopify.com store address, not your customer-facing domain.
              </div>

              <button
                type="submit"
                style={{
                  marginTop:
                    "16px",
                  border:
                    0,
                  background:
                    "#4B1678",
                  color:
                    "white",
                  borderRadius:
                    "10px",
                  padding:
                    "11px 17px",
                  fontWeight:
                    900,
                  cursor:
                    "pointer",
                }}
              >
                Connect Shopify
              </button>
            </Form>
          )}

          {connection?.lastError && (
            <div
              style={{
                marginTop:
                  "18px",
                padding:
                  "12px",
                borderRadius:
                  "10px",
                background:
                  "#fff4e5",
                color:
                  "#7a4d00",
                fontSize:
                  "12px",
              }}
            >
              Last Shopify connection message: {connection.lastError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
