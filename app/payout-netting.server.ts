type PayoutLedgerEntry = {
  sellerId: string;
  shopifyOrderId: string;
  shopifyLineItemId: string | null;
  entryType: string;
  sellerEarningsCents: number;
  payoutAmountCents: number;
};

function lineKey(
  entry: Pick<
    PayoutLedgerEntry,
    "sellerId" | "shopifyOrderId" | "shopifyLineItemId"
  >,
) {
  return `${entry.sellerId}:${entry.shopifyOrderId}:${entry.shopifyLineItemId || ""}`;
}

export function netSaleRemainingCents(
  saleEntry: PayoutLedgerEntry,
  refundEntries: PayoutLedgerEntry[],
) {
  const unpaidSaleCents = Math.max(
    saleEntry.sellerEarningsCents - saleEntry.payoutAmountCents,
    0,
  );

  if (saleEntry.entryType !== "SALE" || unpaidSaleCents <= 0) {
    return 0;
  }

  const saleKey = lineKey(saleEntry);
  const refundLiabilityCents = refundEntries
    .filter(
      (entry) =>
        entry.entryType === "REFUND" &&
        lineKey(entry) === saleKey,
    )
    .reduce(
      (total, entry) =>
        total + Math.max(-entry.sellerEarningsCents, 0),
      0,
    );

  return Math.max(unpaidSaleCents - refundLiabilityCents, 0);
}
