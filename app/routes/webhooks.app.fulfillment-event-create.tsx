import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";


// ==========================================================
// SHOPIFY FULFILLMENT EVENT PAYLOAD
// ==========================================================

type ShopifyFulfillmentEventPayload = {
  id?: number | string;
  order_id?: number | string;
  fulfillment_id?: number | string;
  status?: string;
  happened_at?: string;
};


// ==========================================================
// HELPERS
// ==========================================================

function legacyIdFromGid(value?: string | null) {
  if (!value) return null;

  const parts =
    value.split("/");

  return (
    parts[parts.length - 1] ||
    null
  );
}


function addHours(
  date: Date,
  hours: number,
) {
  return new Date(
    date.getTime() +
      hours *
        60 *
        60 *
        1000,
  );
}


function addDays(
  date: Date,
  days: number,
) {
  return new Date(
    date.getTime() +
      days *
        24 *
        60 *
        60 *
        1000,
  );
}


// ==========================================================
// FULFILLMENT EVENTS / CREATE WEBHOOK
//
// CONFIRMED DELIVERY FLOW
//
// 1. Find exact Shopify line items in this fulfillment.
// 2. Mark only matching HairGrab SALE rows delivered.
// 3. Set payout availability:
//      STANDARD = delivery + 14 days
//      FAST     = delivery + 48 hours
// 4. Check whether ALL of this seller's items on the
//    Shopify order have now been delivered.
// 5. Count seller + Shopify order only ONCE.
// 6. Check whether seller has earned FAST payouts.
//
// FAST PAYOUT QUALIFICATION
//
// - Seller ACTIVE
// - At least 30 days since approval
// - At least 10 successfully delivered orders
// - No Fast Payout suspension
// - Payout account is not RESTRICTED
//
// IMPORTANT:
//
// availableOn does NOT mean the seller has been paid.
//
// SALE remains PENDING until HairGrab's separate payout
// eligibility process confirms:
//
// - availableOn has arrived
// - customer funds are CLEARED
// - seller remains in good standing
// - no applicable refund / financial hold prevents payout
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {

  const {
    topic,
    shop,
    payload,
    admin,
    session,
  } =
    await authenticate.webhook(
      request,
    );


  // ========================================================
  // VERIFY TOPIC
  // ========================================================

  if (
    topic !==
    "FULFILLMENT_EVENTS_CREATE"
  ) {
    console.log(
      `[HairGrab Core] Ignored webhook topic ${topic} from ${shop}`,
    );

    return new Response(
      "OK",
      {
        status: 200,
      },
    );
  }


  const event =
    payload as ShopifyFulfillmentEventPayload;


  const status =
    String(
      event?.status ||
        "",
    )
      .trim()
      .toLowerCase();


  // ========================================================
  // WE ONLY PROCESS DELIVERED EVENTS
  // ========================================================

  if (
    status !==
    "delivered"
  ) {
    console.log(
      `[HairGrab Core] Fulfillment event ignored: status=${status}.`,
    );

    return new Response(
      "OK",
      {
        status: 200,
      },
    );
  }


  if (
    !event?.order_id ||
    !event?.fulfillment_id
  ) {
    console.error(
      "[HairGrab Core] Delivered fulfillment event missing order_id or fulfillment_id.",
    );

    return new Response(
      "OK",
      {
        status: 200,
      },
    );
  }


  const orderId =
    String(
      event.order_id,
    );

  const fulfillmentId =
    String(
      event.fulfillment_id,
    );


  const deliveredAt =
    event.happened_at
      ? new Date(
          event.happened_at,
        )
      : new Date();


  if (
    Number.isNaN(
      deliveredAt.getTime(),
    )
  ) {
    console.error(
      `[HairGrab Core] Invalid delivery date received for Shopify order ${orderId}.`,
    );

    return new Response(
      "OK",
      {
        status: 200,
      },
    );
  }


  if (
    !session ||
    !admin
  ) {
    console.error(
      `[HairGrab Core] No Shopify admin session available for delivered order ${orderId}.`,
    );

    return new Response(
      "OK",
      {
        status: 200,
      },
    );
  }


  // ========================================================
  // LOAD EXACT SHOPIFY LINE ITEMS IN THIS FULFILLMENT
  //
  // One Shopify order may contain:
  //
  // - multiple sellers
  // - multiple packages
  // - multiple fulfillments
  //
  // We therefore cannot assume the entire order was
  // delivered when one fulfillment event arrives.
  // ========================================================

  const response =
    await admin.graphql(
      `#graphql
      query HairGrabFulfillment($id: ID!) {
        fulfillment(id: $id) {
          id

          fulfillmentLineItems(first: 100) {
            nodes {
              lineItem {
                id
              }
            }
          }
        }
      }`,
      {
        variables: {
          id:
            `gid://shopify/Fulfillment/${fulfillmentId}`,
        },
      },
    );


  const fulfillmentData =
    await response.json();


  const fulfillment =
    fulfillmentData
      ?.data
      ?.fulfillment;


  if (!fulfillment) {
    console.error(
      `[HairGrab Core] Could not load Shopify fulfillment ${fulfillmentId}.`,
    );

    return new Response(
      "OK",
      {
        status: 200,
      },
    );
  }


  const fulfillmentLineItems =
    Array.isArray(
      fulfillment
        .fulfillmentLineItems
        ?.nodes,
    )
      ? fulfillment
          .fulfillmentLineItems
          .nodes
      : [];


  const lineItemIds =
    fulfillmentLineItems
      .map(
        (item: any) =>
          legacyIdFromGid(
            item
              ?.lineItem
              ?.id,
          ),
      )
      .filter(
        (
          id: string | null,
        ): id is string =>
          Boolean(id),
      );


  if (
    lineItemIds.length ===
    0
  ) {
    console.log(
      `[HairGrab Core] Delivered fulfillment ${fulfillmentId} contained no usable line item IDs.`,
    );

    return new Response(
      "OK",
      {
        status: 200,
      },
    );
  }


  // ========================================================
  // FIND HAIRGRAB SALE ENTRIES FOR DELIVERED LINES
  // ========================================================

  const ledgerEntries =
    await db
      .sellerLedgerEntry
      .findMany({
        where: {
          shopifyOrderId:
            orderId,

          shopifyLineItemId: {
            in:
              lineItemIds,
          },

          entryType:
            "SALE",
        },

        select: {
          id:
            true,

          sellerId:
            true,

          shopifyOrderName:
            true,

          shopifyLineItemId:
            true,

          deliveredAt:
            true,

          availableOn:
            true,
        },
      });


  if (
    ledgerEntries.length ===
    0
  ) {
    console.log(
      `[HairGrab Core] No HairGrab seller ledger entries matched delivered fulfillment ${fulfillmentId}.`,
    );

    return new Response(
      "OK",
      {
        status: 200,
      },
    );
  }


  // ========================================================
  // MARK THESE SALE ROWS DELIVERED
  //
  // Webhook retries will not overwrite an existing
  // deliveredAt timestamp.
  // ========================================================

  await db
    .sellerLedgerEntry
    .updateMany({
      where: {
        id: {
          in:
            ledgerEntries.map(
              (entry) =>
                entry.id,
            ),
        },

        deliveredAt:
          null,
      },

      data: {
        shopifyFulfillmentId:
          fulfillmentId,

        deliveredAt,
      },
    });


  // ========================================================
  // UNIQUE SELLERS REPRESENTED IN THIS FULFILLMENT
  // ========================================================

  const sellerIds =
    Array.from(
      new Set(
        ledgerEntries.map(
          (entry) =>
            entry.sellerId,
        ),
      ),
    );


  // ========================================================
  // PROCESS EACH SELLER
  // ========================================================

  for (
    const sellerId
    of sellerIds
  ) {

    const sellerOrderEntry =
      ledgerEntries.find(
        (entry) =>
          entry.sellerId ===
          sellerId,
      );


    let seller =
      await db
        .seller
        .findUnique({
          where: {
            id:
              sellerId,
          },
        });


    if (!seller) {
      continue;
    }


    // ======================================================
    // CHECK WHETHER ALL OF THIS SELLER'S ITEMS ON THIS
    // SHOPIFY ORDER ARE DELIVERED
    //
    // This fixes the split-package problem.
    //
    // Example:
    //
    // Seller A has 3 lines in order #1001.
    //
    // Package 1 delivers 2 lines.
    // Package 2 is still traveling.
    //
    // HairGrab does NOT count the order yet.
    //
    // Only after all 3 SALE rows have deliveredAt does
    // the order count toward Fast Payout qualification.
    // ======================================================

    const allSellerOrderSales =
      await db
        .sellerLedgerEntry
        .findMany({
          where: {
            sellerId,

            shopifyOrderId:
              orderId,

            entryType:
              "SALE",
          },

          select: {
            id:
              true,

            deliveredAt:
              true,
          },
        });


    const allSellerItemsDelivered =
      allSellerOrderSales.length >
        0 &&
      allSellerOrderSales.every(
        (entry) =>
          Boolean(
            entry.deliveredAt,
          ),
      );


    // ======================================================
    // COUNT SUCCESSFUL SELLER ORDER ONCE
    // ======================================================

    let newlyCounted =
      false;


    if (
      allSellerItemsDelivered
    ) {

      const existingDelivery =
        await db
          .sellerDeliveredOrder
          .findUnique({
            where: {
              sellerId_shopifyOrderId: {
                sellerId,

                shopifyOrderId:
                  orderId,
              },
            },
          });


      if (
        !existingDelivery
      ) {

        try {

          await db
            .$transaction(
              async (tx) => {

                await tx
                  .sellerDeliveredOrder
                  .create({
                    data: {
                      sellerId,

                      shopifyOrderId:
                        orderId,

                      shopifyOrderName:
                        sellerOrderEntry
                          ?.shopifyOrderName ||
                        orderId,

                      shopifyFulfillmentId:
                        fulfillmentId,

                      deliveredAt,

                      qualificationCountedAt:
                        new Date(),
                    },
                  });


                await tx
                  .seller
                  .update({
                    where: {
                      id:
                        sellerId,
                    },

                    data: {
                      successfulDeliveredOrders: {
                        increment:
                          1,
                      },
                    },
                  });
              },
            );


          newlyCounted =
            true;

        } catch (
          error: any
        ) {

          // Unique seller + Shopify order constraint
          // protects against simultaneous webhook retries.
          if (
            error?.code !==
            "P2002"
          ) {
            throw error;
          }
        }
      }
    }


    // Reload seller if the delivery counter changed.
    if (
      newlyCounted
    ) {
      const refreshedSeller =
        await db
          .seller
          .findUnique({
            where: {
              id:
                sellerId,
            },
          });


      if (
        refreshedSeller
      ) {
        seller =
          refreshedSeller;
      }
    }


    // ======================================================
    // FAST PAYOUT QUALIFICATION
    // ======================================================

    const approvalDate =
      seller.approvedAt;


    const thirtyDaysAgo =
      new Date(
        Date.now() -
          30 *
            24 *
            60 *
            60 *
            1000,
      );


    const has30Days =
      Boolean(
        approvalDate &&
          approvalDate <=
            thirtyDaysAgo,
      );


    const has10Deliveries =
      seller
        .successfulDeliveredOrders >=
      10;


    const goodStanding =
      seller.status ===
        "ACTIVE" &&
      !seller
        .fastPayoutSuspendedAt &&
      seller.payoutStatus !==
        "RESTRICTED";


    let effectivePayoutTier =
      seller.payoutTier;


    if (
      seller.payoutTier ===
        "STANDARD" &&
      has30Days &&
      has10Deliveries &&
      goodStanding
    ) {

      const unlockedAt =
        new Date();


      const updatedSeller =
        await db
          .seller
          .update({
            where: {
              id:
                sellerId,
            },

            data: {
              payoutTier:
                "FAST",

              fastPayoutEligibleAt:
                unlockedAt,

              fastPayoutUnlockedAt:
                unlockedAt,
            },
          });


      seller =
        updatedSeller;

      effectivePayoutTier =
        "FAST";


      console.log(
        `[HairGrab Core] ${seller.sellerCode} unlocked FAST payouts after ${seller.successfulDeliveredOrders} successful delivered orders.`,
      );

    } else {

      console.log(
        `[HairGrab Core] ${seller.sellerCode} delivery recorded. Successful deliveries: ${seller.successfulDeliveredOrders}. All seller items delivered: ${allSellerItemsDelivered}. 30-day requirement: ${has30Days}. Fast Payout tier: ${seller.payoutTier}.`,
      );
    }


    // ======================================================
    // SET PAYOUT AVAILABILITY FOR THE LINES IN THIS
    // DELIVERED FULFILLMENT
    //
    // STANDARD:
    // delivery + 14 days
    //
    // FAST:
    // delivery + 48 hours
    //
    // This does NOT make the sale ELIGIBLE yet.
    // ======================================================

    const sellerLedgerEntryIds =
      ledgerEntries
        .filter(
          (entry) =>
            entry.sellerId ===
            sellerId,
        )
        .map(
          (entry) =>
            entry.id,
        );


    if (
      sellerLedgerEntryIds.length >
      0
    ) {

      const availableOn =
        effectivePayoutTier ===
          "FAST"
          ? addHours(
              deliveredAt,
              48,
            )
          : addDays(
              deliveredAt,
              14,
            );


      await db
        .sellerLedgerEntry
        .updateMany({
          where: {
            id: {
              in:
                sellerLedgerEntryIds,
            },

            availableOn:
              null,
          },

          data: {
            availableOn,
          },
        });


      console.log(
        `[HairGrab Core] ${seller.sellerCode} payout availability set to ${availableOn.toISOString()} using ${effectivePayoutTier} payout rules.`,
      );
    }
  }


  console.log(
    `[HairGrab Core] Confirmed delivery processed for Shopify order ${orderId}, fulfillment ${fulfillmentId}.`,
  );


  return new Response(
    "OK",
    {
      status: 200,
    },
  );
};