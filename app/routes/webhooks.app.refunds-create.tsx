import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";


// ==========================================================
// SHOPIFY REFUND PAYLOAD
// ==========================================================

type ShopifyRefundLineItem = {
  id?: number | string;
  quantity?: number;
  subtotal?: number | string;
  total_tax?: number | string;

  line_item?: {
    id?: number | string;
    price?: string;
    quantity?: number;
    total_discount?: string;
  };
};

type ShopifyRefundPayload = {
  id: number | string;
  order_id: number | string;
  created_at?: string;
  refund_line_items?: ShopifyRefundLineItem[];
};


// ==========================================================
// MONEY HELPERS
// ==========================================================

function dollarsToCents(value: string | number | undefined) {
  const amount =
    typeof value === "number"
      ? value
      : Number(value || 0);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}


// ==========================================================
// REFUNDS / CREATE WEBHOOK
//
// IMPORTANT:
// - Handles partial and full line-item refunds.
// - Only adjusts the seller who owns the refunded line.
// - Shopify retries cannot create duplicate refund entries.
// - Does NOT automatically mark a seller payout "paid" or
//   "reversed" here.
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {

  const {
    topic,
    shop,
    payload,
  } = await authenticate.webhook(request);


  if (topic !== "REFUNDS_CREATE") {
    console.log(
      `[HairGrab Core] Ignored webhook topic ${topic} from ${shop}`,
    );

    return new Response("OK", {
      status: 200,
    });
  }


  const refund =
    payload as ShopifyRefundPayload;


  if (!refund?.id || !refund?.order_id) {
    console.error(
      "[HairGrab Core] refunds/create webhook received without refund ID or order ID.",
    );

    return new Response("OK", {
      status: 200,
    });
  }


  const refundId =
    String(refund.id);

  const orderId =
    String(refund.order_id);

  const refundLineItems =
    Array.isArray(refund.refund_line_items)
      ? refund.refund_line_items
      : [];


  console.log(
    `[HairGrab Core] Processing refund ${refundId} for Shopify order ${orderId}.`,
  );


  // ========================================================
  // PROCESS EACH REFUNDED LINE ITEM
  // ========================================================

  for (const refundLine of refundLineItems) {

    const shopifyLineItemId =
      refundLine?.line_item?.id
        ? String(refundLine.line_item.id)
        : null;


    if (!shopifyLineItemId) {
      console.log(
        `[HairGrab Core] Refund ${refundId} contained a line without Shopify line item ID. Skipping.`,
      );

      continue;
    }


    // Find the original HairGrab SALE ledger entry.
    const saleEntry =
      await db.sellerLedgerEntry.findFirst({
        where: {
          shopifyOrderId:
            orderId,

          shopifyLineItemId,

          entryType:
            "SALE",
        },
      });


    if (!saleEntry) {
      console.log(
        `[HairGrab Core] Refund ${refundId}: no HairGrab SALE entry found for order ${orderId}, line ${shopifyLineItemId}.`,
      );

      continue;
    }


    const refundQuantity =
      Math.max(
        Number(refundLine.quantity || 0),
        0,
      );


    // Prefer Shopify's refund subtotal if provided.
    // Otherwise calculate from original unit price.
    let refundedGrossCents =
      dollarsToCents(
        refundLine.subtotal,
      );


    if (refundedGrossCents <= 0) {

      const originalUnitPriceCents =
        dollarsToCents(
          refundLine.line_item?.price,
        );


      refundedGrossCents =
        Math.max(
          originalUnitPriceCents *
            refundQuantity,
          0,
        );
    }


    // Never refund more seller gross than the original SALE.
    refundedGrossCents =
      Math.min(
        refundedGrossCents,
        saleEntry.grossAmountCents,
      );


    if (refundedGrossCents <= 0) {
      continue;
    }


    const commissionRate =
      saleEntry.commissionRate;


    const commissionRefundCents =
      Math.round(
        refundedGrossCents *
          (commissionRate / 100),
      );


    const sellerRefundResponsibilityCents =
      Math.max(
        refundedGrossCents -
          commissionRefundCents,
        0,
      );


    // One unique REFUND ledger record per Shopify refund +
    // Shopify line item.
    const idempotencyKey =
      `REFUND:${refundId}:${shopifyLineItemId}`;


    const existingRefundEntry =
      await db.sellerLedgerEntry.findUnique({
        where: {
          idempotencyKey,
        },
      });


    if (existingRefundEntry) {
      console.log(
        `[HairGrab Core] Refund ledger entry already exists for refund ${refundId}, line ${shopifyLineItemId}. Skipping duplicate.`,
      );

      continue;
    }


    await db.$transaction(
      async (tx) => {

        await tx.sellerLedgerEntry.create({
          data: {
            sellerId:
              saleEntry.sellerId,

            shopifyOrderId:
              orderId,

            shopifyOrderName:
              saleEntry.shopifyOrderName,

            shopifyLineItemId,

            idempotencyKey,

            entryType:
              "REFUND",

            status:
              "ELIGIBLE",

            currency:
              saleEntry.currency,

            commissionRate,

            // Refunds are stored as zero gross SALE value
            // plus explicit refundAmountCents.
            grossAmountCents:
              0,

            commissionAmountCents:
              -commissionRefundCents,

            sellerEarningsCents:
              -sellerRefundResponsibilityCents,

            refundAmountCents:
              refundedGrossCents,

            payoutAmountCents:
              0,

            description:
              `Refund for ${saleEntry.shopifyOrderName || orderId}`,

            fundsStatus:
              "CLEARED",

            fundsClearedAt:
              new Date(),

            shopifyCreatedAt:
              refund.created_at
                ? new Date(refund.created_at)
                : new Date(),
          },
        });


        // Track cumulative refund amount against the original SALE.
        await tx.sellerLedgerEntry.update({
          where: {
            id:
              saleEntry.id,
          },

          data: {
            refundAmountCents: {
              increment:
                refundedGrossCents,
            },
          },
        });
      },
    );


    console.log(
      `[HairGrab Core] Refund ${refundId} → seller ${saleEntry.sellerId} → Gross refund ${refundedGrossCents} cents → commission reversal ${commissionRefundCents} cents → seller responsibility ${sellerRefundResponsibilityCents} cents.`,
    );
  }


  return new Response("OK", {
    status: 200,
  });
};