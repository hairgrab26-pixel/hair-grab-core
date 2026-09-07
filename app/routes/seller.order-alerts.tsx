import type {
  LoaderFunctionArgs,
} from "react-router";

import db from "../db.server";

import {
  requireSellerSession,
} from "../seller-session.server";


// ==========================================================
// SELLER ORDER ALERT FEED
//
// Resource route used by the seller dashboard.
//
// URL:
// /seller/order-alerts
//
// Returns recent NEW_ORDER notifications only.
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


  const alerts =
    await db.sellerNotification.findMany({
      where: {
        sellerId:
          seller.id,

        type:
          "NEW_ORDER",
      },

      orderBy: {
        createdAt:
          "desc",
      },

      take:
        25,

      select: {
        id:
          true,

        title:
          true,

        message:
          true,

        linkUrl:
          true,

        createdAt:
          true,
      },
    });


  return new Response(
    JSON.stringify({
      alerts:
        alerts.map(
          (
            alert,
          ) => ({
            id:
              alert.id,

            title:
              alert.title,

            message:
              alert.message,

            linkUrl:
              alert.linkUrl ||
              "/seller/orders",

            createdAt:
              alert.createdAt.toISOString(),
          }),
        ),
    }),

    {
      status:
        200,

      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store, no-cache, must-revalidate",
      },
    },
  );
};