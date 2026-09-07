import db from "./db.server";

// ==========================================================
// HAIRGRAB SELLER NOTIFICATION ENGINE
//
// Creates seller notifications from HairGrab Core data.
//
// Notification types:
// NEW_MESSAGE
// NEW_ORDER
// SHIPPING
// DELIVERED
// PAYOUT_READY
//
// dedupeKey prevents the same event from creating
// duplicate notifications.
// ==========================================================

export async function syncSellerNotifications(
  sellerId: string,
) {
  const [
    ledgerEntries,
    fulfillments,
    conversation,
  ] =
    await Promise.all([
      db.sellerLedgerEntry.findMany({
        where: {
          sellerId,
        },

        select: {
          id:
            true,

          shopifyOrderId:
            true,

          shopifyOrderName:
            true,

          entryType:
            true,

          status:
            true,

          sellerEarningsCents:
            true,

          createdAt:
            true,
        },

        orderBy: {
          createdAt:
            "desc",
        },
      }),

      db.sellerOrderFulfillment.findMany({
        where: {
          sellerId,
        },

        select: {
          id:
            true,

          shopifyOrderId:
            true,

          shopifyOrderName:
            true,

          status:
            true,

          carrier:
            true,

          trackingNumber:
            true,

          createdAt:
            true,

          updatedAt:
            true,
        },

        orderBy: {
          updatedAt:
            "desc",
        },
      }),

      db.sellerConversation.findUnique({
        where: {
          sellerId,
        },

        select: {
          id:
            true,
        },
      }),
    ]);


  // ========================================================
  // NEW ORDER NOTIFICATIONS
  // ========================================================

  const orders =
    new Map<
      string,
      {
        orderId: string;
        orderName: string;
      }
    >();


  for (
    const entry of
    ledgerEntries
  ) {
    if (
      !entry.shopifyOrderId
    ) {
      continue;
    }


    if (
      entry.entryType !==
      "SALE"
    ) {
      continue;
    }


    const orderId =
      String(
        entry.shopifyOrderId,
      );


    if (
      !orders.has(
        orderId,
      )
    ) {
      orders.set(
        orderId,
        {
          orderId,

          orderName:
            entry.shopifyOrderName ||
            `Order ${orderId}`,
        },
      );
    }
  }


  for (
    const order of
    orders.values()
  ) {
    await createNotification({
      sellerId,

      type:
        "NEW_ORDER",

      title:
        "New HairGrab Order",

      message:
        `${order.orderName} is ready in Orders & Shipping.`,

      linkUrl:
        "/seller/orders",

      dedupeKey:
        `new-order:${sellerId}:${order.orderId}`,
    });
  }


  // ========================================================
  // PAYOUT READY NOTIFICATIONS
  // ========================================================

  for (
    const entry of
    ledgerEntries
  ) {
    if (
      entry.status !==
      "ELIGIBLE"
    ) {
      continue;
    }


    const amount =
      Number(
        entry.sellerEarningsCents ||
        0,
      ) / 100;


    await createNotification({
      sellerId,

      type:
        "PAYOUT_READY",

      title:
        "Payout Ready",

      message:
        `${formatMoney(
          amount,
        )} from ${
          entry.shopifyOrderName ||
          "a HairGrab order"
        } is eligible for payout.`,

      linkUrl:
        "/seller",

      dedupeKey:
        `payout-ready:${sellerId}:${entry.id}`,
    });
  }


  // ========================================================
  // SHIPPING + DELIVERY NOTIFICATIONS
  // ========================================================

  for (
    const fulfillment of
    fulfillments
  ) {
    const status =
      String(
        fulfillment.status ||
        "",
      ).toUpperCase();


    const orderName =
      fulfillment.shopifyOrderName ||
      "Your HairGrab order";


    if (
      status ===
      "SHIPPED"
    ) {
      let shippingMessage =
        `${orderName} has been marked shipped.`;


      if (
        fulfillment.carrier
      ) {
        shippingMessage +=
          ` Carrier: ${fulfillment.carrier}.`;
      }


      if (
        fulfillment.trackingNumber
      ) {
        shippingMessage +=
          ` Tracking: ${fulfillment.trackingNumber}.`;
      }


      await createNotification({
        sellerId,

        type:
          "SHIPPING",

        title:
          "Order Shipped",

        message:
          shippingMessage,

        linkUrl:
          "/seller/orders",

        dedupeKey:
          `shipping:${sellerId}:${fulfillment.id}`,
      });
    }


    if (
      status ===
      "DELIVERED"
    ) {
      await createNotification({
        sellerId,

        type:
          "DELIVERED",

        title:
          "Order Delivered",

        message:
          `${orderName} has been marked delivered.`,

        linkUrl:
          "/seller/orders",

        dedupeKey:
          `delivered:${sellerId}:${fulfillment.id}`,
      });
    }
  }


  // ========================================================
  // HAIRGRAB MESSAGE NOTIFICATIONS
  // ========================================================

  if (
    conversation
  ) {
    const hairGrabMessages =
      await db.sellerMessage.findMany({
        where: {
          conversationId:
            conversation.id,

          senderType:
            "HAIRGRAB",
        },

        select: {
          id:
            true,

          body:
            true,

          createdAt:
            true,
        },

        orderBy: {
          createdAt:
            "desc",
        },
      });


    for (
      const message of
      hairGrabMessages
    ) {
      await createNotification({
        sellerId,

        type:
          "NEW_MESSAGE",

        title:
          "New Message from HairGrab",

        message:
          message.body,

        linkUrl:
          "/seller/messages",

        dedupeKey:
          `hairgrab-message:${sellerId}:${message.id}`,
      });
    }
  }
}


// ==========================================================
// CREATE DEDUPED NOTIFICATION
// ==========================================================

async function createNotification({
  sellerId,
  type,
  title,
  message,
  linkUrl,
  dedupeKey,
}: {
  sellerId: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  dedupeKey: string;
}) {
  await db.sellerNotification.upsert({
    where: {
      dedupeKey,
    },

    update: {},

    create: {
      sellerId,
      type,
      title,
      message,
      linkUrl,
      dedupeKey,
    },
  });
}


// ==========================================================
// MONEY
// ==========================================================

function formatMoney(
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