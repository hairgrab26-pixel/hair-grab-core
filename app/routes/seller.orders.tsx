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
import { unauthenticated } from "../shopify.server";
import { requireSellerSession } from "../seller-session.server";


async function getShopifyAdmin() {
  const offlineSession =
    await db.session.findFirst({
      where: {
        isOnline: false,
      },
    });

  if (!offlineSession) {
    throw new Error(
      "HairGrab could not find the Shopify offline session.",
    );
  }

  return unauthenticated.admin(
    offlineSession.shop,
  );
}


export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  const entries =
    await db.sellerLedgerEntry.findMany({
      where: {
        sellerId:
          seller.id,
        entryType:
          "SALE",
      },

      select: {
        shopifyOrderId:
          true,
        shopifyOrderName:
          true,
        grossAmountCents:
          true,
        shopifyCreatedAt:
          true,
        shopifyFulfillmentId:
          true,
        deliveredAt:
          true,
        createdAt:
          true,
      },

      orderBy: {
        createdAt:
          "desc",
      },
    });

  const grouped =
    new Map<
      string,
      {
        id:
          string;
        name:
          string;
        amountCents:
          number;
        createdAt:
          string;
        status:
          "READY_TO_SHIP" |
          "SHIPPED" |
          "DELIVERED";
      }
    >();

  for (
    const entry of
    entries
  ) {
    const id =
      String(
        entry.shopifyOrderId,
      );

    const existing =
      grouped.get(id);

    const status =
      entry.deliveredAt
        ? "DELIVERED"
        : entry.shopifyFulfillmentId
          ? "SHIPPED"
          : "READY_TO_SHIP";

    if (existing) {
      existing.amountCents +=
        Number(
          entry.grossAmountCents ||
          0,
        );

      if (
        status ===
        "DELIVERED"
      ) {
        existing.status =
          "DELIVERED";
      } else if (
        status ===
          "SHIPPED" &&
        existing.status !==
          "DELIVERED"
      ) {
        existing.status =
          "SHIPPED";
      }

      continue;
    }

    grouped.set(
      id,
      {
        id,
        name:
          entry.shopifyOrderName ||
          "HairGrab Order",

        amountCents:
          Number(
            entry.grossAmountCents ||
            0,
          ),

        createdAt:
          (
            entry.shopifyCreatedAt ||
            entry.createdAt
          ).toISOString(),

        status,
      },
    );
  }

  const orders =
    Array.from(
      grouped.values(),
    );

  return {
    seller: {
      businessName:
        seller.businessName,
      sellerCode:
        seller.sellerCode,
    },

    counts: {
      ready:
        orders.filter(
          (order) =>
            order.status ===
            "READY_TO_SHIP",
        ).length,

      shipped:
        orders.filter(
          (order) =>
            order.status ===
            "SHIPPED",
        ).length,

      delivered:
        orders.filter(
          (order) =>
            order.status ===
            "DELIVERED",
        ).length,

      total:
        orders.length,
    },

    orders,
  };
};


export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const { seller } =
    await requireSellerSession(
      request,
    );

  try {
    const formData =
      await request.formData();

    const orderId =
      String(
        formData.get(
          "orderId",
        ) || "",
      ).trim();

    const carrier =
      String(
        formData.get(
          "carrier",
        ) || "",
      ).trim();

    const tracking =
      String(
        formData.get(
          "tracking",
        ) || "",
      ).trim();

    if (
      !orderId ||
      !tracking
    ) {
      return {
        success:
          false,
        message:
          "Order and tracking number are required.",
      };
    }

    const sellerOrder =
      await db.sellerLedgerEntry.findFirst({
        where: {
          sellerId:
            seller.id,
          shopifyOrderId:
            orderId,
          entryType:
            "SALE",
        },
      });

    if (!sellerOrder) {
      return {
        success:
          false,
        message:
          "This order does not belong to your HairGrab store.",
      };
    }

    const { admin } =
      await getShopifyAdmin();

    const response =
      await admin.graphql(
        `#graphql
        query HairGrabSellerFulfillmentOrder(
          $id: ID!
        ) {
          order(id: $id) {
            id

            fulfillmentOrders(
              first: 20
            ) {
              nodes {
                id
                status

                lineItems(
                  first: 100
                ) {
                  nodes {
                    id
                    remainingQuantity

                    lineItem {
                      id
                      vendor
                    }
                  }
                }
              }
            }
          }
        }
        `,
        {
          variables: {
            id:
              orderId,
          },
        },
      );

    const json =
      await response.json();

    if (
      json?.errors
        ?.length
    ) {
      throw new Error(
        json.errors
          .map(
            (error: {
              message?: string;
            }) =>
              error.message ||
              "Unable to load order fulfillment.",
          )
          .join(" | "),
      );
    }

    const fulfillmentOrders =
      json?.data
        ?.order
        ?.fulfillmentOrders
        ?.nodes ||
      [];

    const lineItemsByFulfillmentOrder =
      fulfillmentOrders
        .map(
          (
            fulfillmentOrder:
              any,
          ) => {
            const sellerLineItems =
              (
                fulfillmentOrder
                  ?.lineItems
                  ?.nodes ||
                []
              )
                .filter(
                  (
                    item:
                      any,
                  ) =>
                    item
                      ?.lineItem
                      ?.vendor ===
                      seller.shopifyVendor &&
                    Number(
                      item
                        ?.remainingQuantity ||
                      0,
                    ) >
                      0,
                )
                .map(
                  (
                    item:
                      any,
                  ) => ({
                    id:
                      item.id,
                    quantity:
                      Number(
                        item
                          .remainingQuantity,
                      ),
                  }),
                );

            if (
              sellerLineItems.length ===
              0
            ) {
              return null;
            }

            return {
              fulfillmentOrderId:
                fulfillmentOrder.id,

              fulfillmentOrderLineItems:
                sellerLineItems,
            };
          },
        )
        .filter(Boolean);

    if (
      lineItemsByFulfillmentOrder.length ===
      0
    ) {
      return {
        success:
          false,
        message:
          "There are no unfulfilled items for your store on this order.",
      };
    }

    const fulfillmentResponse =
      await admin.graphql(
        `#graphql
        mutation HairGrabShipSellerOrder(
          $fulfillment: FulfillmentInput!
        ) {
          fulfillmentCreate(
            fulfillment: $fulfillment
          ) {
            fulfillment {
              id
              status

              trackingInfo {
                company
                number
                url
              }
            }

            userErrors {
              field
              message
            }
          }
        }
        `,
        {
          variables: {
            fulfillment: {
              lineItemsByFulfillmentOrder,

              notifyCustomer:
                true,

              trackingInfo: {
                company:
                  carrier ||
                  "Other",

                number:
                  tracking,
              },
            },
          },
        },
      );

    const fulfillmentJson =
      await fulfillmentResponse.json();

    const result =
      fulfillmentJson?.data
        ?.fulfillmentCreate;

    const errors =
      result?.userErrors ||
      [];

    if (
      errors.length >
      0
    ) {
      throw new Error(
        errors
          .map(
            (error: {
              message?: string;
            }) =>
              error.message ||
              "Unable to create shipment.",
          )
          .join(" | "),
      );
    }

    const fulfillmentId =
      result?.fulfillment
        ?.id;

    if (!fulfillmentId) {
      throw new Error(
        "Shopify did not return a fulfillment.",
      );
    }

    await db.sellerLedgerEntry.updateMany({
      where: {
        sellerId:
          seller.id,
        shopifyOrderId:
          orderId,
        entryType:
          "SALE",
      },
      data: {
        shopifyFulfillmentId:
          String(
            fulfillmentId,
          ),
      },
    });

    return {
      success:
        true,
      message:
        `Shipment saved. Tracking: ${tracking}`,
    };
  } catch (error) {
    console.error(
      "[HairGrab Core] Seller shipment error:",
      error,
    );

    return {
      success:
        false,
      message:
        error instanceof
        Error
          ? error.message
          : "HairGrab could not save the shipment.",
    };
  }
};


function money(
  cents: number,
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
    cents /
    100,
  );
}


export default function SellerOrdersPage() {
  const {
    seller,
    counts,
    orders,
  } =
    useLoaderData<
      typeof loader
    >();

  const actionData =
    useActionData<
      typeof action
    >();

  return (
    <div
      style={{
        minHeight:
          "100vh",
        background:
          "#faf8fc",
        fontFamily:
          "Arial, sans-serif",
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
            "18px 22px",
        }}
      >
        <div
          style={{
            maxWidth:
              "1180px",
            margin:
              "0 auto",
          }}
        >
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
            Orders & Shipping
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
            "26px 20px 60px",
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

        <h1
          style={{
            margin:
              "10px 0 4px",
            color:
              "#4B1678",
          }}
        >
          Orders & Shipping
        </h1>

        <div
          style={{
            color:
              "#756b79",
            fontSize:
              "12px",
          }}
        >
          {seller.businessName} · Receive the order, ship it, add tracking, done.
        </div>

        {actionData && (
          <div
            style={{
              marginTop:
                "16px",
              padding:
                "12px",
              borderRadius:
                "10px",
              background:
                actionData.success
                  ? "#edf8ef"
                  : "#fff1f1",
              color:
                actionData.success
                  ? "#28743b"
                  : "#922f2f",
              fontSize:
                "12px",
              fontWeight:
                "700",
            }}
          >
            {actionData.message}
          </div>
        )}

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(150px, 1fr))",
            gap:
              "12px",
            marginTop:
              "20px",
          }}
        >
          <CountCard
            label="Ready to Ship"
            value={
              counts.ready
            }
          />

          <CountCard
            label="Shipped"
            value={
              counts.shipped
            }
          />

          <CountCard
            label="Delivered"
            value={
              counts.delivered
            }
          />

          <CountCard
            label="Total Orders"
            value={
              counts.total
            }
          />
        </div>

        <div
          style={{
            display:
              "grid",
            gap:
              "12px",
            marginTop:
              "22px",
          }}
        >
          {orders.length ===
          0 ? (
            <div
              style={{
                background:
                  "white",
                border:
                  "1px solid #e5dce9",
                borderRadius:
                  "14px",
                padding:
                  "38px 20px",
                textAlign:
                  "center",
                color:
                  "#756b79",
                fontSize:
                  "13px",
              }}
            >
              No HairGrab orders yet.
            </div>
          ) : (
            orders.map(
              (order) => (
                <OrderCard
                  key={
                    order.id
                  }
                  order={
                    order
                  }
                />
              ),
            )
          )}
        </div>
      </main>
    </div>
  );
}


function CountCard({
  label,
  value,
}: {
  label: string;
  value: number;
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
          fontWeight:
            "800",
          fontSize:
            "23px",
          marginTop:
            "4px",
        }}
      >
        {value}
      </div>
    </div>
  );
}


function OrderCard({
  order,
}: {
  order: {
    id: string;
    name: string;
    amountCents: number;
    createdAt: string;
    status:
      "READY_TO_SHIP" |
      "SHIPPED" |
      "DELIVERED";
  };
}) {
  const ready =
    order.status ===
    "READY_TO_SHIP";

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
          "17px",
      }}
    >
      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
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
                "#4B1678",
              fontWeight:
                "800",
              fontSize:
                "15px",
            }}
          >
            {order.name}
          </div>

          <div
            style={{
              color:
                "#756b79",
              fontSize:
                "11px",
              marginTop:
                "4px",
            }}
          >
            {new Date(
              order.createdAt,
            ).toLocaleDateString()}
            {" · "}
            {money(
              order.amountCents,
            )}
          </div>
        </div>

        <span
          style={{
            height:
              "fit-content",
            background:
              ready
                ? "#fff4e8"
                : order.status ===
                    "DELIVERED"
                  ? "#edf8ef"
                  : "#f2eafa",
            color:
              ready
                ? "#9a5c18"
                : order.status ===
                    "DELIVERED"
                  ? "#28743b"
                  : "#4B1678",
            borderRadius:
              "20px",
            padding:
              "6px 9px",
            fontSize:
              "10px",
            fontWeight:
              "800",
          }}
        >
          {order.status
            .replace(
              /_/g,
              " ",
            )}
        </span>
      </div>

      {ready && (
        <Form
          method="post"
          style={{
            marginTop:
              "15px",
            borderTop:
              "1px solid #eee7f2",
            paddingTop:
              "15px",
          }}
        >
          <input
            type="hidden"
            name="orderId"
            value={
              order.id
            }
          />

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "minmax(130px, .5fr) minmax(180px, 1fr) auto",
              gap:
                "9px",
              alignItems:
                "end",
            }}
          >
            <label>
              <div
                style={
                  miniLabel
                }
              >
                Carrier
              </div>

              <select
                name="carrier"
                defaultValue="USPS"
                style={
                  field
                }
              >
                <option>
                  USPS
                </option>
                <option>
                  UPS
                </option>
                <option>
                  FedEx
                </option>
                <option>
                  DHL
                </option>
                <option>
                  Other
                </option>
              </select>
            </label>

            <label>
              <div
                style={
                  miniLabel
                }
              >
                Tracking Number
              </div>

              <input
                name="tracking"
                required
                placeholder="Paste tracking number"
                style={
                  field
                }
              />
            </label>

            <button
              type="submit"
              style={{
                border:
                  0,
                background:
                  "#4B1678",
                color:
                  "white",
                borderRadius:
                  "9px",
                padding:
                  "11px 14px",
                fontWeight:
                  "800",
                cursor:
                  "pointer",
              }}
            >
              Mark Shipped
            </button>
          </div>
        </Form>
      )}
    </div>
  );
}


const field = {
  width:
    "100%",
  boxSizing:
    "border-box" as const,
  border:
    "1px solid #d8cce0",
  borderRadius:
    "9px",
  padding:
    "10px",
  background:
    "white",
};

const miniLabel = {
  color:
    "#756b79",
  fontSize:
    "10px",
  fontWeight:
    "700",
  marginBottom:
    "5px",
};
