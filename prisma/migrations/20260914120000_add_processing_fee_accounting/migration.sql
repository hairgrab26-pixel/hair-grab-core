-- Store the actual Shopify capture processing fee separately from commission,
-- gross sales, refunds, payouts, and seller earnings.
ALTER TABLE "SellerLedgerEntry"
ADD COLUMN "processingFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "processingFeeStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "processingFeeFinalizedAt" TIMESTAMP(3);
