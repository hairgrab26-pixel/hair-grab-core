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

  const parts = value.split("/");
  return parts[parts.length - 1] || null;
}


// ==========================================================
// FULFILLMENT EVENTS / CREATE WEBHOOK
//
// Confirmed delivery does four things:
//
// 1. Finds the exact Shopify line items in this fulfillment.
// 2. Marks the matching HairGrab SALE ledger entries delivered.
// 3. Counts seller + Shopify order only ONCE toward qualification.
// 4. Checks whether the seller has earned FAST payouts.
//
// FAST PAYOUT RULE:
// - seller ACTIVE
// - at least 30 days since approval
// - at least 10 successfully delivered orders
// - no active Fast Payout suspension
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
  } = await authenticate.webhook(request);


  if (topic !== "FULFILLMENT_EVENTS_CREATE") {
    console.log(
      `[HairGrab Core] Ignored webhook topic ${topic} from ${shop}`,
    );

    return new Response("OK", {
      status: 200,
    });
  }


  const event =
    payload as ShopifyFulfillmentEventPayload;


  const status =
    String(event?.status || "")
      .trim()
      .toLowerCase();


  // We only care about confirmed delivery.
  if (status !== "delivered") {
    console.log(
      `[HairGrab Core] Fulfillment event ignored: status=${status}.`,
    );

    return new Response("OK", {
      status: 200,
    });
  }


  if (!event?.order_id || !event?.fulfillment_id) {
    console.error(
      "[HairGrab Core] Delivered fulfillment event missing order_id or fulfillment_id.",
    );

    return new Response("OK", {
      status: 200,
    });
  }


  const orderId =
    String(event.order_id);

  const fulfillmentId =
    String(event.fulfillment_id);

  const deliveredAt =
    event.happened_at
      ? new Date(event.happened_at)
      : new Date();


  if (!session || !admin) {
    console.error(
      `[HairGrab Core] No Shopify admin session available for delivered order ${orderId}.`,
    );

    return new Response("OK", {
      status: 200,
    });
  }


  // ========================================================
  // LOAD THE EXACT SHOPIFY LINE ITEMS IN THIS FULFILLMENT
  //
  // A multi-seller Shopify order may contain several
  // fulfillments. We must only credit the seller whose
  // line items are actually inside THIS delivered fulfillment.
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
    fulfillmentData?.data?.fulfillment;


  if (!fulfillment) {
    console.error(
      `[HairGrab Core] Could not load Shopify fulfillment ${fulfillmentId}.`,
    );

    return new Response("OK", {
      status: 200,
    });
  }


  const fulfillmentLineItems =
    Array.isArray(
      fulfillment.fulfillmentLineItems?.nodes,
    )
      ? fulfillment.fulfillmentLineItems.nodes
      : [];


  const lineItemIds =
    fulfillmentLineItems
      .map(
        (item: any) =>
          legacyIdFromGid(
            item?.lineItem?.id,
          ),
      )
      .filter(
        (id: string | null): id is string =>
          Boolean(id),
      );


  if (lineItemIds.length === 0) {
    console.log(
      `[HairGrab Core] Delivered fulfillment ${fulfillmentId} contained no usable line item IDs.`,
    );

    return new Response("OK", {
      status: 200,
    });
  }


  // ========================================================
  // FIND HAIRGRAB SALE ENTRIES FOR THE DELIVERED LINES
  // ========================================================

  const ledgerEntries =
    await db.sellerLedgerEntry.findMany({
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
      },
    });


  if (ledgerEntries.length === 0) {
    console.log(
      `[HairGrab Core] No HairGrab seller ledger entries matched delivered fulfillment ${fulfillmentId}.`,
    );

    return new Response("OK", {
      status: 200,
    });
  }


  // Mark only the SALE rows that belong to this fulfillment.
  await db.sellerLedgerEntry.updateMany({
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


  // One Shopify fulfillment may contain multiple lines for
  // the same seller, so reduce this to unique sellers.
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
  // CREDIT EACH SELLER'S SUCCESSFUL DELIVERY ONCE
  // ========================================================

  for (const sellerId of sellerIds) {

    const sellerOrderEntry =
      ledgerEntries.find(
        (entry) =>
          entry.sellerId ===
          sellerId,
      );


    const seller =
      await db.seller.findUnique({
        where: {
          id:
            sellerId,
        },
      });


    if (!seller) {
      continue;
    }


    // One qualifying record per seller + Shopify order.
    // The unique DB constraint protects us from webhook retries
    // and multiple delivered line items.
    const existingDelivery =
      await db.sellerDeliveredOrder.findUnique({
        where: {
          sellerId_shopifyOrderId: {
            sellerId,
            shopifyOrderId:
              orderId,
          },
        },
      });


    let newlyCounted =
      false;


    if (!existingDelivery) {

      try {

        await db.$transaction(
          async (tx) => {

            await tx.sellerDeliveredOrder.create({
              data: {
                sellerId,

                shopifyOrderId:
                  orderId,

                shopifyOrderName:
                  sellerOrderEntry?.shopifyOrderName ||
                  orderId,

                shopifyFulfillmentId:
                  fulfillmentId,

                deliveredAt,

                qualificationCountedAt:
                  new Date(),
              },
            });


            await tx.seller.update({
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

      } catch (error: any) {

        // If Shopify retried at the same moment another request
        // already created the unique seller/order record,
        // do not count the order twice.
        if (error?.code !== "P2002") {
          throw error;
        }
      }
    }


    const refreshedSeller =
      newlyCounted
        ? await db.seller.findUnique({
            where: {
              id:
                sellerId,
            },
          })
        : seller;


    if (!refreshedSeller) {
      continue;
    }


    // ======================================================
    // FAST PAYOUT QUALIFICATION
    // ======================================================

    const approvalDate =
      refreshedSeller.approvedAt;


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
      refreshedSeller.successfulDeliveredOrders >=
      10;


    const goodStanding =
      refreshedSeller.status ===
        "ACTIVE" &&
      !refreshedSeller.fastPayoutSuspendedAt;


    if (
      refreshedSeller.payoutTier ===
        "STANDARD" &&
      has30Days &&
      has10Deliveries &&
      goodStanding
    ) {

      const unlockedAt =
        new Date();


      await db.seller.update({
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


      console.log(
        `[HairGrab Core] ${refreshedSeller.sellerCode} unlocked FAST payouts after ${refreshedSeller.successfulDeliveredOrders} successful delivered orders.`,
      );
    } else {

      console.log(
        `[HairGrab Core] ${refreshedSeller.sellerCode} delivery recorded. Successful deliveries: ${refreshedSeller.successfulDeliveredOrders}. 30-day requirement: ${has30Days}. Fast Payout tier: ${refreshedSeller.payoutTier}.`,
      );
    }
  }


  console.log(
    `[HairGrab Core] Confirmed delivery processed for Shopify order ${orderId}, fulfillment ${fulfillmentId}.`,
  );


  return new Response("OK", {
    status: 200,
  });
};