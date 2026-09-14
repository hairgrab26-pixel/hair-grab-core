import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { calculateRefundReversal } from "../refund-safety.server";


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


    const reversal = await db.$transaction(
      async (tx) => {

        const currentSale =
          await tx.sellerLedgerEntry.findUnique({
            where: { id: saleEntry.id },
          });

        if (!currentSale || currentSale.entryType !== "SALE") {
          return null;
        }

        if (currentSale.processingFeeStatus !== "FINALIZED") {
          throw new Error(
            `Refund ${refundId} is waiting for processing-fee finalization on order ${orderId}.`,
          );
        }

        const existingRefunds =
          await tx.sellerLedgerEntry.findMany({
            where: {
              sellerId: currentSale.sellerId,
              shopifyOrderId: currentSale.shopifyOrderId,
              shopifyLineItemId:
                currentSale.shopifyLineItemId,
              entryType: "REFUND",
            },
            select: {
              commissionAmountCents: true,
              sellerEarningsCents: true,
            },
          });

        const commissionAlreadyReversedCents =
          existingRefunds.reduce(
            (total, entry) =>
              total +
              Math.max(-entry.commissionAmountCents, 0),
            0,
          );
        const sellerAlreadyReversedCents =
          existingRefunds.reduce(
            (total, entry) =>
              total +
              Math.max(-entry.sellerEarningsCents, 0),
            0,
          );

        const reversal = calculateRefundReversal({
          requestedGrossCents: refundedGrossCents,
          originalGrossCents: currentSale.grossAmountCents,
          cumulativeRefundedGrossCents:
            currentSale.refundAmountCents,
          originalCommissionCents:
            currentSale.commissionAmountCents,
          originalSellerEarningsCents:
            currentSale.sellerEarningsCents,
          priorCommissionReversalCents:
            commissionAlreadyReversedCents,
          priorSellerReversalCents:
            sellerAlreadyReversedCents,
          commissionRate:
            currentSale.commissionRate,
        });

        if (!reversal) {
          return null;
        }

        await tx.sellerLedgerEntry.create({
          data: {
            sellerId:
              currentSale.sellerId,

            shopifyOrderId:
              orderId,

            shopifyOrderName:
              currentSale.shopifyOrderName,

            shopifyLineItemId,

            idempotencyKey,

            entryType:
              "REFUND",

            status:
              "ELIGIBLE",

            currency:
              currentSale.currency,

            commissionRate:
              currentSale.commissionRate,

            // Refunds are stored as zero gross SALE value
            // plus explicit refundAmountCents.
            grossAmountCents:
              0,

            commissionAmountCents:
              -reversal.commissionRefundCents,

            sellerEarningsCents:
              -reversal.sellerRefundResponsibilityCents,

            refundAmountCents:
              reversal.refundedGrossCents,

            payoutAmountCents:
              0,

            description:
              `Refund for ${currentSale.shopifyOrderName || orderId}`,

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
              currentSale.id,
          },

          data: {
            refundAmountCents: {
              increment:
                reversal.refundedGrossCents,
            },
          },
        });

        return {
          refundedGrossCents: reversal.refundedGrossCents,
          commissionRefundCents: reversal.commissionRefundCents,
          sellerRefundResponsibilityCents:
            reversal.sellerRefundResponsibilityCents,
        };
      },
      {
        isolationLevel: "Serializable",
      },
    );

    if (!reversal) {
      console.log(
        `[HairGrab Core] Refund ${refundId}: no refundable seller balance remains for line ${shopifyLineItemId}.`,
      );
      continue;
    }

    const commissionRefundCents =
      reversal.commissionRefundCents;
    const sellerRefundResponsibilityCents =
      reversal.sellerRefundResponsibilityCents;
    refundedGrossCents =
      reversal.refundedGrossCents;


    console.log(
      `[HairGrab Core] Refund ${refundId} → seller ${saleEntry.sellerId} → Gross refund ${refundedGrossCents} cents → commission reversal ${commissionRefundCents} cents → seller responsibility ${sellerRefundResponsibilityCents} cents.`,
    );
  }


  return new Response("OK", {
    status: 200,
  });
};
