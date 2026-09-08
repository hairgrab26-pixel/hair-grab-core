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


// ==========================================================
// SHOPIFY ADMIN
// ==========================================================

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


// ==========================================================
// HELPERS
// ==========================================================

function money(
  cents: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    },
  ).format(
    cents / 100,
  );
}


function formatStatus(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return "Not Set";
  }

  return value
    .replace(
      /_/g,
      " ",
    )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (
        letter,
      ) =>
        letter.toUpperCase(),
    );
}


function normalizeShopifyOrderId(
  value: string,
) {
  if (
    value.startsWith(
      "gid://shopify/Order/",
    )
  ) {
    return value;
  }

  return `gid://shopify/Order/${value}`;
}


// ==========================================================
// SHIPPO TEST RATE HELPERS
// ==========================================================

type HairGrabShippingRate = {
  id: string;
  provider: string;
  service: string;
  amount: string;
  currency: string;
  estimatedDays: number | null;
  durationTerms: string | null;
};


function getShippoToken() {
  const token =
    process.env.SHIPPO_API_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "SHIPPO_API_TOKEN is not configured in Railway.",
    );
  }

  return token;
}


function shippoErrorMessage(
  payload: any,
  fallback: string,
) {
  if (
    typeof payload?.detail ===
      "string" &&
    payload.detail.trim()
  ) {
    return payload.detail.trim();
  }

  if (
    typeof payload?.message ===
      "string" &&
    payload.message.trim()
  ) {
    return payload.message.trim();
  }

  if (
    Array.isArray(payload?.messages) &&
    payload.messages.length > 0
  ) {
    const joined =
      payload.messages
        .map(
          (item: any) =>
            item?.text ||
            item?.message ||
            item?.code ||
            "",
        )
        .filter(Boolean)
        .join(" | ");

    if (joined) {
      return joined;
    }
  }

  return fallback;
}


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


  const fulfillmentRecords =
    await db.sellerOrderFulfillment.findMany({
      where: {
        sellerId:
          seller.id,
      },
    });


  const fulfillmentByOrder =
    new Map(
      fulfillmentRecords.map(
        (
          fulfillment,
        ) => [
          fulfillment.shopifyOrderId,
          fulfillment,
        ],
      ),
    );


  const grouped =
    new Map<
      string,
      {
        id: string;
        name: string;
        amountCents: number;
        createdAt: string;

        shopifyStatus:
          | "READY_TO_SHIP"
          | "SHIPPED"
          | "DELIVERED";

        fulfillmentMethod:
          string | null;

        fulfillmentStatus:
          string | null;

        carrier:
          string | null;

        trackingNumber:
          string | null;

        trackingUrl:
          string | null;

        shippingLabelUrl:
          string | null;

        packageLengthInches:
          number | null;

        packageWidthInches:
          number | null;

        packageHeightInches:
          number | null;

        packageWeightOunces:
          number | null;

        courierProvider:
          string | null;

        courierStatus:
          string | null;
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
      grouped.get(
        id,
      );


    const shopifyStatus =
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
        shopifyStatus ===
        "DELIVERED"
      ) {
        existing.shopifyStatus =
          "DELIVERED";
      } else if (
        shopifyStatus ===
          "SHIPPED" &&
        existing.shopifyStatus !==
          "DELIVERED"
      ) {
        existing.shopifyStatus =
          "SHIPPED";
      }

      continue;
    }


    const fulfillment =
      fulfillmentByOrder.get(
        id,
      );


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

        shopifyStatus,

        fulfillmentMethod:
          fulfillment
            ?.fulfillmentMethod ||
          null,

        fulfillmentStatus:
          fulfillment
            ?.status ||
          null,

        carrier:
          fulfillment
            ?.carrier ||
          null,

        trackingNumber:
          fulfillment
            ?.trackingNumber ||
          null,

        trackingUrl:
          fulfillment
            ?.trackingUrl ||
          null,

        shippingLabelUrl:
          fulfillment
            ?.shippingLabelUrl ||
          null,

        packageLengthInches:
          fulfillment
            ?.packageLengthInches ||
          null,

        packageWidthInches:
          fulfillment
            ?.packageWidthInches ||
          null,

        packageHeightInches:
          fulfillment
            ?.packageHeightInches ||
          null,

        packageWeightOunces:
          fulfillment
            ?.packageWeightOunces ||
          null,

        courierProvider:
          fulfillment
            ?.courierProvider ||
          null,

        courierStatus:
          fulfillment
            ?.courierStatus ||
          null,
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

      shopifyVendor:
        seller.shopifyVendor,

      nationwideShippingMethod:
        seller.nationwideShippingMethod,

      offersLocalPickup:
        seller.offersLocalPickup,

      offersLocalDelivery:
        seller.offersLocalDelivery,
    },


    counts: {
      ready:
        orders.filter(
          (
            order,
          ) =>
            order.shopifyStatus ===
            "READY_TO_SHIP",
        ).length,

      shipped:
        orders.filter(
          (
            order,
          ) =>
            order.shopifyStatus ===
            "SHIPPED",
        ).length,

      delivered:
        orders.filter(
          (
            order,
          ) =>
            order.shopifyStatus ===
            "DELIVERED",
        ).length,

      total:
        orders.length,
    },

    orders,
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

  try {
    const formData =
      await request.formData();


    const intent =
      String(
        formData.get(
          "intent",
        ) ||
          "",
      ).trim();


    const orderId =
      String(
        formData.get(
          "orderId",
        ) ||
          "",
      ).trim();


    if (!orderId) {
      return {
        success: false,

        message:
          "Order was not provided.",
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
        success: false,

        message:
          "This order does not belong to your HairGrab store.",
      };
    }


    // ========================================================
    // CHOOSE FULFILLMENT METHOD
    // ========================================================

    if (
      intent ===
      "set-fulfillment-method"
    ) {
      const fulfillmentMethod =
        String(
          formData.get(
            "fulfillmentMethod",
          ) ||
            "",
        )
          .trim()
          .toUpperCase();


      const allowedMethods =
        [
          "SELLER_MANAGED",
          "HAIRGRAB_SHIPPING",
          "LOCAL_PICKUP",
          "HAIRGRAB_SAME_DAY",
        ];


      if (
        !allowedMethods.includes(
          fulfillmentMethod,
        )
      ) {
        return {
          success: false,

          message:
            "Choose a valid fulfillment method.",
        };
      }


      if (
        fulfillmentMethod ===
          "LOCAL_PICKUP" &&
        !seller.offersLocalPickup
      ) {
        return {
          success: false,

          message:
            "Local Pickup is not enabled for your HairGrab store.",
        };
      }


      if (
        fulfillmentMethod ===
          "HAIRGRAB_SAME_DAY" &&
        !seller.offersLocalDelivery
      ) {
        return {
          success: false,

          message:
            "HairGrab Same-Day Delivery is not enabled for your store.",
        };
      }


      await db.sellerOrderFulfillment.upsert({
        where: {
          sellerId_shopifyOrderId: {
            sellerId:
              seller.id,

            shopifyOrderId:
              orderId,
          },
        },

        update: {
          fulfillmentMethod,

          status:
            "READY",
        },

        create: {
          sellerId:
            seller.id,

          shopifyOrderId:
            orderId,

          shopifyOrderName:
            sellerOrder.shopifyOrderName,

          fulfillmentMethod,

          status:
            "READY",
        },
      });


      return {
        success: true,

        message:
          `Fulfillment method set to ${formatStatus(
            fulfillmentMethod,
          )}.`,
      };
    }


    // ========================================================
    // LOCAL PICKUP - MARK READY
    // ========================================================

    if (
      intent ===
      "ready-for-pickup"
    ) {
      const fulfillment =
        await db.sellerOrderFulfillment.findUnique({
          where: {
            sellerId_shopifyOrderId: {
              sellerId:
                seller.id,

              shopifyOrderId:
                orderId,
            },
          },
        });


      if (
        !fulfillment ||
        fulfillment.fulfillmentMethod !==
          "LOCAL_PICKUP"
      ) {
        return {
          success: false,

          message:
            "This order is not set for Local Pickup.",
        };
      }


      await db.sellerOrderFulfillment.update({
        where: {
          sellerId_shopifyOrderId: {
            sellerId:
              seller.id,

            shopifyOrderId:
              orderId,
          },
        },

        data: {
          status:
            "READY_FOR_PICKUP",

          readyForPickupAt:
            new Date(),
        },
      });


      return {
        success: true,

        message:
          "Order marked ready for customer pickup.",
      };
    }


    // ========================================================
    // SAME-DAY DELIVERY - SELLER MARKS PACKAGE READY
    // ========================================================

    if (
      intent ===
      "ready-for-same-day"
    ) {
      const fulfillment =
        await db.sellerOrderFulfillment.findUnique({
          where: {
            sellerId_shopifyOrderId: {
              sellerId:
                seller.id,

              shopifyOrderId:
                orderId,
            },
          },
        });


      if (
        !fulfillment ||
        fulfillment.fulfillmentMethod !==
          "HAIRGRAB_SAME_DAY"
      ) {
        return {
          success: false,

          message:
            "This order is not set for HairGrab Same-Day Delivery.",
        };
      }


      await db.sellerOrderFulfillment.update({
        where: {
          sellerId_shopifyOrderId: {
            sellerId:
              seller.id,

            shopifyOrderId:
              orderId,
          },
        },

        data: {
          status:
            "READY_FOR_PICKUP",

          readyForPickupAt:
            new Date(),

          courierStatus:
            "WAITING_FOR_DISPATCH",
        },
      });


      return {
        success: true,

        message:
          "Order is ready for HairGrab Same-Day Delivery. Courier dispatch will be connected in the next phase.",
      };
    }


    // ========================================================
    // HAIRGRAB SHIPPING - GET SHIPPO TEST RATES
    // No postage is purchased in this step.
    // ========================================================

    if (
      intent ===
      "get-hairgrab-shipping-rates"
    ) {
      const fulfillmentRecord =
        await db.sellerOrderFulfillment.findUnique({
          where: {
            sellerId_shopifyOrderId: {
              sellerId:
                seller.id,

              shopifyOrderId:
                orderId,
            },
          },
        });


      if (
        !fulfillmentRecord ||
        fulfillmentRecord.fulfillmentMethod !==
          "HAIRGRAB_SHIPPING"
      ) {
        return {
          success: false,

          message:
            "This order is not set for HairGrab Shipping.",
        };
      }


      if (
        !seller.address1 ||
        !seller.city ||
        !seller.state ||
        !seller.postalCode
      ) {
        return {
          success: false,

          message:
            "Your seller shipping address is incomplete. Add your street address, city, state and ZIP in Store Settings before requesting rates.",
        };
      }


      const packageLength =
        Number(
          formData.get(
            "packageLength",
          ),
        );

      const packageWidth =
        Number(
          formData.get(
            "packageWidth",
          ),
        );

      const packageHeight =
        Number(
          formData.get(
            "packageHeight",
          ),
        );

      const packageWeight =
        Number(
          formData.get(
            "packageWeight",
          ),
        );


      if (
        !Number.isFinite(
          packageLength,
        ) ||
        packageLength <= 0 ||
        !Number.isFinite(
          packageWidth,
        ) ||
        packageWidth <= 0 ||
        !Number.isFinite(
          packageHeight,
        ) ||
        packageHeight <= 0 ||
        !Number.isFinite(
          packageWeight,
        ) ||
        packageWeight <= 0
      ) {
        return {
          success: false,

          message:
            "Enter valid package dimensions and weight before requesting shipping rates.",
        };
      }


      const {
        admin,
      } =
        await getShopifyAdmin();


      const orderResponse =
        await admin.graphql(
          `#graphql
          query HairGrabShippoOrderAddress(
            $id: ID!
          ) {
            order(id: $id) {
              id
              name
              email

              shippingAddress {
                firstName
                lastName
                company
                address1
                address2
                city
                provinceCode
                zip
                countryCodeV2
                phone
              }
            }
          }
          `,
          {
            variables: {
              id:
                normalizeShopifyOrderId(
                  orderId,
                ),
            },
          },
        );


      const orderJson =
        await orderResponse.json();


      if (
        orderJson?.errors?.length
      ) {
        throw new Error(
          orderJson.errors
            .map(
              (
                error: {
                  message?: string;
                },
              ) =>
                error.message ||
                "Unable to load the customer shipping address.",
            )
            .join(
              " | ",
            ),
        );
      }


      const shopifyOrder =
        orderJson?.data?.order;

      const shippingAddress =
        shopifyOrder?.shippingAddress;


      if (
        !shippingAddress?.address1 ||
        !shippingAddress?.city ||
        !shippingAddress?.zip ||
        !shippingAddress?.countryCodeV2
      ) {
        return {
          success: false,

          message:
            "This order does not have a complete shippable customer address.",
        };
      }


      const shippoResponse =
        await fetch(
          "https://api.goshippo.com/shipments/",
          {
            method:
              "POST",

            headers: {
              Authorization:
                `ShippoToken ${getShippoToken()}`,

              "Content-Type":
                "application/json",

              "SHIPPO-API-VERSION":
                "2018-02-08",
            },

            body:
              JSON.stringify({
                address_from: {
                  name:
                    [
                      seller.contactFirstName,
                      seller.contactLastName,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                    seller.businessName,

                  company:
                    seller.businessName,

                  street1:
                    seller.address1,

                  street2:
                    seller.address2 ||
                    "",

                  city:
                    seller.city,

                  state:
                    seller.state,

                  zip:
                    seller.postalCode,

                  country:
                    seller.country ||
                    "US",

                  phone:
                    seller.phone ||
                    undefined,

                  email:
                    seller.email ||
                    undefined,
                },

                address_to: {
                  name:
                    [
                      shippingAddress.firstName,
                      shippingAddress.lastName,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                    shippingAddress.company ||
                    "HairGrab Customer",

                  company:
                    shippingAddress.company ||
                    undefined,

                  street1:
                    shippingAddress.address1,

                  street2:
                    shippingAddress.address2 ||
                    "",

                  city:
                    shippingAddress.city,

                  state:
                    shippingAddress.provinceCode ||
                    "",

                  zip:
                    shippingAddress.zip,

                  country:
                    shippingAddress.countryCodeV2,

                  phone:
                    shippingAddress.phone ||
                    undefined,

                  email:
                    shopifyOrder.email ||
                    undefined,
                },

                parcels: [
                  {
                    length:
                      String(
                        packageLength,
                      ),

                    width:
                      String(
                        packageWidth,
                      ),

                    height:
                      String(
                        packageHeight,
                      ),

                    distance_unit:
                      "in",

                    weight:
                      String(
                        packageWeight,
                      ),

                    mass_unit:
                      "oz",
                  },
                ],

                metadata:
                  `${seller.sellerCode} ${shopifyOrder.name || orderId}`.slice(
                    0,
                    100,
                  ),

                async:
                  false,
              }),
          },
        );


      const shippoJson =
        await shippoResponse.json();


      if (
        !shippoResponse.ok
      ) {
        throw new Error(
          shippoErrorMessage(
            shippoJson,
            "Shippo could not return shipping rates.",
          ),
        );
      }


      const rates:
        HairGrabShippingRate[] =
        (
          Array.isArray(
            shippoJson?.rates,
          )
            ? shippoJson.rates
            : []
        )
          .filter(
            (rate: any) =>
              rate?.object_id &&
              rate?.amount,
          )
          .map(
            (rate: any) => ({
              id:
                String(
                  rate.object_id,
                ),

              provider:
                String(
                  rate.provider ||
                    "Carrier",
                ),

              service:
                String(
                  rate?.servicelevel
                    ?.name ||
                    "Shipping Service",
                ),

              amount:
                String(
                  rate.amount,
                ),

              currency:
                String(
                  rate.currency ||
                    "USD",
                ),

              estimatedDays:
                Number.isFinite(
                  Number(
                    rate.estimated_days,
                  ),
                )
                  ? Number(
                      rate.estimated_days,
                    )
                  : null,

              durationTerms:
                rate.duration_terms
                  ? String(
                      rate.duration_terms,
                    )
                  : null,
            }))
          .sort(
            (
              a,
              b,
            ) =>
              Number(
                a.amount,
              ) -
              Number(
                b.amount,
              ),
          );


      if (
        rates.length ===
        0
      ) {
        throw new Error(
          shippoErrorMessage(
            shippoJson,
            "Shippo did not return any rates for this package and address.",
          ),
        );
      }


      await db.sellerOrderFulfillment.update({
        where: {
          sellerId_shopifyOrderId: {
            sellerId:
              seller.id,

            shopifyOrderId:
              orderId,
          },
        },

        data: {
          packageLengthInches:
            packageLength,

          packageWidthInches:
            packageWidth,

          packageHeightInches:
            packageHeight,

          packageWeightOunces:
            packageWeight,

          shippingPurchaseStatus:
            "RATES_READY",

          shippingPurchaseError:
            null,
        },
      });


      return {
        success: true,

        message:
          `Shippo returned ${rates.length} test shipping rate${rates.length === 1 ? "" : "s"}. No postage has been purchased.`,

        ratesOrderId:
          orderId,

        rates,
      };
    }


    // ========================================================
    // SELLER-MANAGED SHIPPING
    // Existing working Shopify fulfillment process
    // ========================================================

    if (
      intent ===
      "mark-shipped"
    ) {
      const fulfillmentRecord =
        await db.sellerOrderFulfillment.findUnique({
          where: {
            sellerId_shopifyOrderId: {
              sellerId:
                seller.id,

              shopifyOrderId:
                orderId,
            },
          },
        });


      if (
        !fulfillmentRecord ||
        fulfillmentRecord.fulfillmentMethod !==
          "SELLER_MANAGED"
      ) {
        return {
          success: false,

          message:
            "This order is not set for Seller Managed Shipping.",
        };
      }


      const carrier =
        String(
          formData.get(
            "carrier",
          ) ||
            "",
        ).trim();


      const tracking =
        String(
          formData.get(
            "tracking",
          ) ||
            "",
        ).trim();


      if (!tracking) {
        return {
          success: false,

          message:
            "Tracking number is required.",
        };
      }


      const {
        admin,
      } =
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
                normalizeShopifyOrderId(
                  orderId,
                ),
            },
          },
        );


      const json =
        await response.json();


      if (
        json?.errors?.length
      ) {
        throw new Error(
          json.errors
            .map(
              (
                error: {
                  message?: string;
                },
              ) =>
                error.message ||
                "Unable to load order fulfillment.",
            )
            .join(
              " | ",
            ),
        );
      }


      const fulfillmentOrders =
        json?.data?.order
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
                          item.remainingQuantity,
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
          success: false,

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
        fulfillmentJson
          ?.data
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
              (
                error: {
                  message?: string;
                },
              ) =>
                error.message ||
                "Unable to create shipment.",
            )
            .join(
              " | ",
            ),
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


      const trackingUrl =
        result?.fulfillment
          ?.trackingInfo?.url ||
        null;


      await db.$transaction([
        db.sellerLedgerEntry.updateMany({
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
        }),


        db.sellerOrderFulfillment.update({
          where: {
            sellerId_shopifyOrderId: {
              sellerId:
                seller.id,

              shopifyOrderId:
                orderId,
            },
          },

          data: {
            status:
              "SHIPPED",

            carrier:
              carrier ||
              "Other",

            trackingNumber:
              tracking,

            trackingUrl,

            shippedAt:
              new Date(),
          },
        }),
      ]);


      return {
        success: true,

        message:
          `Shipment saved. Tracking: ${tracking}`,
      };
    }


    return {
      success: false,

      message:
        "Unknown fulfillment action.",
    };
  } catch (error) {
    console.error(
      "[HairGrab Core] Seller fulfillment error:",
      error,
    );


    return {
      success: false,

      message:
        error instanceof
        Error
          ? error.message
          : "HairGrab could not update the order.",
    };
  }
};


// ==========================================================
// PAGE
// ==========================================================

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


  const shippingRates =
    actionData &&
    "rates" in actionData &&
    Array.isArray(
      actionData.rates,
    )
      ? actionData.rates
      : [];


  const shippingRatesOrderId =
    actionData &&
    "ratesOrderId" in
      actionData
      ? String(
          actionData.ratesOrderId ||
            "",
        )
      : "";


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
            Orders & Fulfillment
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
          Orders & Fulfillment
        </h1>


        <div
          style={{
            color:
              "#756b79",

            fontSize:
              "12px",
          }}
        >
          {seller.businessName}
          {" · "}
          Process each HairGrab order using the fulfillment method that applies.
        </div>


        <div
          style={{
            marginTop:
              "14px",

            background:
              "#f7f2fa",

            border:
              "1px solid #eadff0",

            borderRadius:
              "10px",

            padding:
              "12px",

            color:
              "#6f6675",

            fontSize:
              "10px",

            lineHeight:
              1.55,
          }}
        >
          Until HairGrab checkout automatically assigns the shopper's selected method,
          choose the correct fulfillment method when you begin processing a new order.
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
            label="Ready"
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
              (
                order,
              ) => (
                <OrderCard
                  key={
                    order.id
                  }

                  order={
                    order
                  }

                  seller={
                    seller
                  }

                  shippingRates={
                    shippingRatesOrderId ===
                    order.id
                      ? shippingRates
                      : []
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


// ==========================================================
// COUNT CARD
// ==========================================================

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


// ==========================================================
// ORDER CARD
// ==========================================================

function OrderCard({
  order,
  seller,
  shippingRates,
}: {
  order: {
    id: string;
    name: string;
    amountCents: number;
    createdAt: string;

    shopifyStatus:
      | "READY_TO_SHIP"
      | "SHIPPED"
      | "DELIVERED";

    fulfillmentMethod:
      string | null;

    fulfillmentStatus:
      string | null;

    carrier:
      string | null;

    trackingNumber:
      string | null;

    trackingUrl:
      string | null;

    shippingLabelUrl:
      string | null;

    packageLengthInches:
      number | null;

    packageWidthInches:
      number | null;

    packageHeightInches:
      number | null;

    packageWeightOunces:
      number | null;

    courierProvider:
      string | null;

    courierStatus:
      string | null;
  };

  seller: {
    nationwideShippingMethod:
      string;

    offersLocalPickup:
      boolean;

    offersLocalDelivery:
      boolean;
  };

  shippingRates:
    HairGrabShippingRate[];
}) {
  const ready =
    order.shopifyStatus ===
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


        <div
          style={{
            display:
              "flex",

            gap:
              "6px",

            flexWrap:
              "wrap",
          }}
        >
          <StatusBadge
            status={
              order.shopifyStatus
            }
          />

          {order.fulfillmentMethod && (
            <StatusBadge
              status={
                order.fulfillmentMethod
              }
              secondary
            />
          )}
        </div>
      </div>


      {/* METHOD NOT CHOSEN */}

      {ready &&
        !order.fulfillmentMethod && (
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
              name="intent"
              value="set-fulfillment-method"
            />

            <input
              type="hidden"
              name="orderId"
              value={
                order.id
              }
            />


            <div
              style={{
                color:
                  "#4B1678",

                fontSize:
                  "12px",

                fontWeight:
                  "800",

                marginBottom:
                  "7px",
              }}
            >
              Choose fulfillment method
            </div>


            <div
              style={{
                color:
                  "#756b79",

                fontSize:
                  "10px",

                lineHeight:
                  1.5,

                marginBottom:
                  "9px",
              }}
            >
              Select how this particular order will reach the shopper.
            </div>


            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "minmax(220px, 1fr) auto",

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
                  Fulfillment Method
                </div>

                <select
                  name="fulfillmentMethod"
                  defaultValue={
                    seller.nationwideShippingMethod
                  }
                  style={
                    field
                  }
                >
                  <option value="SELLER_MANAGED">
                    I Handle My Own Shipping
                  </option>

                  <option value="HAIRGRAB_SHIPPING">
                    HairGrab Shipping
                  </option>

                  {seller.offersLocalPickup && (
                    <option value="LOCAL_PICKUP">
                      Local Pickup
                    </option>
                  )}

                  {seller.offersLocalDelivery && (
                    <option value="HAIRGRAB_SAME_DAY">
                      HairGrab Same-Day Delivery
                    </option>
                  )}
                </select>
              </label>


              <button
                type="submit"
                style={
                  primaryButton
                }
              >
                Continue
              </button>
            </div>
          </Form>
        )}


      {/* SELLER MANAGED SHIPPING */}

      {ready &&
        order.fulfillmentMethod ===
          "SELLER_MANAGED" && (
          <Form
            method="post"
            style={
              actionSection
            }
          >
            <input
              type="hidden"
              name="intent"
              value="mark-shipped"
            />

            <input
              type="hidden"
              name="orderId"
              value={
                order.id
              }
            />


            <div
              style={
                sectionTitle
              }
            >
              Seller Managed Shipping
            </div>


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
                style={
                  primaryButton
                }
              >
                Mark Shipped
              </button>
            </div>
          </Form>
        )}


      {/* HAIRGRAB SHIPPING */}

      {ready &&
        order.fulfillmentMethod ===
          "HAIRGRAB_SHIPPING" && (
          <div
            style={
              actionSection
            }
          >
            <div
              style={
                sectionTitle
              }
            >
              HairGrab Shipping
            </div>


            <div
              style={
                infoBox
              }
            >
              Enter the packed box or mailer size and weight. HairGrab will use your saved seller ship-from address and the customer's Shopify shipping address to request test rates from Shippo. No postage is purchased during this test step.
            </div>


            <Form
              method="post"
              style={{
                marginTop:
                  "12px",
              }}
            >
              <input
                type="hidden"
                name="intent"
                value="get-hairgrab-shipping-rates"
              />

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
                    "repeat(auto-fit, minmax(120px, 1fr))",

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
                    Length (in)
                  </div>

                  <input
                    type="number"
                    name="packageLength"
                    min="0.1"
                    step="0.1"
                    required
                    defaultValue={
                      order.packageLengthInches ||
                      12
                    }
                    style={
                      field
                    }
                  />
                </label>


                <label>
                  <div
                    style={
                      miniLabel
                    }
                  >
                    Width (in)
                  </div>

                  <input
                    type="number"
                    name="packageWidth"
                    min="0.1"
                    step="0.1"
                    required
                    defaultValue={
                      order.packageWidthInches ||
                      9
                    }
                    style={
                      field
                    }
                  />
                </label>


                <label>
                  <div
                    style={
                      miniLabel
                    }
                  >
                    Height (in)
                  </div>

                  <input
                    type="number"
                    name="packageHeight"
                    min="0.1"
                    step="0.1"
                    required
                    defaultValue={
                      order.packageHeightInches ||
                      3
                    }
                    style={
                      field
                    }
                  />
                </label>


                <label>
                  <div
                    style={
                      miniLabel
                    }
                  >
                    Weight (oz)
                  </div>

                  <input
                    type="number"
                    name="packageWeight"
                    min="0.1"
                    step="0.1"
                    required
                    defaultValue={
                      order.packageWeightOunces ||
                      16
                    }
                    style={
                      field
                    }
                  />
                </label>


                <button
                  type="submit"
                  style={
                    primaryButton
                  }
                >
                  Get Shipping Rates
                </button>
              </div>
            </Form>


            {shippingRates.length >
              0 && (
              <div
                style={{
                  marginTop:
                    "14px",
                }}
              >
                <div
                  style={{
                    ...sectionTitle,
                    marginBottom:
                      "7px",
                  }}
                >
                  Shippo Test Rates
                </div>

                <div
                  style={{
                    display:
                      "grid",

                    gap:
                      "8px",
                  }}
                >
                  {shippingRates.map(
                    (
                      rate,
                    ) => (
                      <div
                        key={
                          rate.id
                        }
                        style={{
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

                          border:
                            "1px solid #e5dce9",

                          borderRadius:
                            "10px",

                          padding:
                            "11px 12px",

                          background:
                            "white",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              color:
                                "#21152a",

                              fontWeight:
                                "800",

                              fontSize:
                                "11px",
                            }}
                          >
                            {rate.provider}
                            {" · "}
                            {rate.service}
                          </div>

                          <div
                            style={{
                              color:
                                "#756b79",

                              fontSize:
                                "9px",

                              marginTop:
                                "3px",
                            }}
                          >
                            {rate.estimatedDays !==
                            null
                              ? `${rate.estimatedDays} estimated day${rate.estimatedDays === 1 ? "" : "s"}`
                              : rate.durationTerms ||
                                "Delivery estimate not provided"}
                          </div>
                        </div>

                        <div
                          style={{
                            color:
                              "#4B1678",

                            fontSize:
                              "14px",

                            fontWeight:
                              "900",
                          }}
                        >
                          {new Intl.NumberFormat(
                            "en-US",
                            {
                              style:
                                "currency",
                              currency:
                                rate.currency ||
                                "USD",
                            },
                          ).format(
                            Number(
                              rate.amount,
                            ),
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>

                <div
                  style={{
                    ...infoBox,
                    marginTop:
                      "9px",
                  }}
                >
                  Test rates only. HairGrab has not purchased a label or charged postage. Once this rate test is working correctly, the next step is selecting a rate and generating the Shippo test label automatically.
                </div>
              </div>
            )}
          </div>
        )}


      {/* LOCAL PICKUP */}

      {ready &&
        order.fulfillmentMethod ===
          "LOCAL_PICKUP" && (
          <div
            style={
              actionSection
            }
          >
            <div
              style={
                sectionTitle
              }
            >
              Local Pickup
            </div>


            {order.fulfillmentStatus ===
            "READY_FOR_PICKUP" ? (
              <div
                style={
                  successBox
                }
              >
                ✓ This order is ready for customer pickup.
              </div>
            ) : (
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="ready-for-pickup"
                />

                <input
                  type="hidden"
                  name="orderId"
                  value={
                    order.id
                  }
                />

                <button
                  type="submit"
                  style={
                    primaryButton
                  }
                >
                  Mark Ready for Customer Pickup
                </button>
              </Form>
            )}
          </div>
        )}


      {/* SAME DAY */}

      {ready &&
        order.fulfillmentMethod ===
          "HAIRGRAB_SAME_DAY" && (
          <div
            style={
              actionSection
            }
          >
            <div
              style={
                sectionTitle
              }
            >
              HairGrab Same-Day Delivery
            </div>


            {order.fulfillmentStatus ===
            "READY_FOR_PICKUP" ? (
              <>
                <div
                  style={
                    successBox
                  }
                >
                  ✓ Package is marked ready for courier pickup.
                </div>

                <div
                  style={{
                    ...infoBox,
                    marginTop:
                      "9px",
                  }}
                >
                  Courier dispatch is the next API phase. HairGrab has not requested a driver yet.
                </div>
              </>
            ) : (
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="ready-for-same-day"
                />

                <input
                  type="hidden"
                  name="orderId"
                  value={
                    order.id
                  }
                />

                <button
                  type="submit"
                  style={
                    primaryButton
                  }
                >
                  Package Ready for HairGrab Delivery
                </button>
              </Form>
            )}
          </div>
        )}


      {/* SHIPPED INFO */}

      {order.shopifyStatus ===
        "SHIPPED" && (
        <div
          style={
            actionSection
          }
        >
          <div
            style={
              sectionTitle
            }
          >
            Shipment Information
          </div>

          <div
            style={{
              color:
                "#5f5664",

              fontSize:
                "11px",

              lineHeight:
                1.6,
            }}
          >
            {order.carrier && (
              <div>
                <strong>
                  Carrier:
                </strong>{" "}
                {order.carrier}
              </div>
            )}

            {order.trackingNumber && (
              <div>
                <strong>
                  Tracking:
                </strong>{" "}
                {order.trackingNumber}
              </div>
            )}

            {order.trackingUrl && (
              <div
                style={{
                  marginTop:
                    "5px",
                }}
              >
                <a
                  href={
                    order.trackingUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color:
                      "#4B1678",

                    fontWeight:
                      "800",

                    textDecoration:
                      "none",
                  }}
                >
                  Track Shipment ↗
                </a>
              </div>
            )}
          </div>
        </div>
      )}


      {order.shopifyStatus ===
        "DELIVERED" && (
        <div
          style={{
            ...actionSection,

            background:
              "#f6fbf7",
          }}
        >
          <div
            style={{
              color:
                "#28743b",

              fontSize:
                "11px",

              fontWeight:
                "800",
            }}
          >
            ✓ Delivered
          </div>
        </div>
      )}
    </div>
  );
}


// ==========================================================
// STATUS BADGE
// ==========================================================

function StatusBadge({
  status,
  secondary = false,
}: {
  status: string;
  secondary?: boolean;
}) {
  return (
    <span
      style={{
        height:
          "fit-content",

        background:
          secondary
            ? "#f2eafa"
            : status ===
                "DELIVERED"
              ? "#edf8ef"
              : status ===
                  "READY_TO_SHIP"
                ? "#fff4e8"
                : "#f2eafa",

        color:
          secondary
            ? "#4B1678"
            : status ===
                "DELIVERED"
              ? "#28743b"
              : status ===
                  "READY_TO_SHIP"
                ? "#9a5c18"
                : "#4B1678",

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
      {formatStatus(
        status,
      )}
    </span>
  );
}


// ==========================================================
// STYLES
// ==========================================================

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


const actionSection = {
  marginTop:
    "15px",

  borderTop:
    "1px solid #eee7f2",

  paddingTop:
    "15px",
};


const sectionTitle = {
  color:
    "#4B1678",

  fontSize:
    "12px",

  fontWeight:
    "800",

  marginBottom:
    "9px",
};


const primaryButton = {
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
};


const disabledButton = {
  border:
    "1px solid #d7c9df",

  background:
    "#f4f0f6",

  color:
    "#8b8090",

  borderRadius:
    "9px",

  padding:
    "11px 14px",

  fontWeight:
    "800",

  cursor:
    "not-allowed",

  marginTop:
    "9px",
};


const infoBox = {
  background:
    "#f7f2fa",

  border:
    "1px solid #eadff0",

  borderRadius:
    "9px",

  padding:
    "11px",

  color:
    "#6f6675",

  fontSize:
    "10px",

  lineHeight:
    1.55,
};


const successBox = {
  background:
    "#edf8ef",

  border:
    "1px solid #cfe8d4",

  borderRadius:
    "9px",

  padding:
    "11px",

  color:
    "#28743b",

  fontSize:
    "10px",

  fontWeight:
    "800",
};