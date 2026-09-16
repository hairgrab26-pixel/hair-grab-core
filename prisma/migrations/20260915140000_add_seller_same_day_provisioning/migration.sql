ALTER TABLE "Seller"
  ADD COLUMN "shopifyFulfillmentServiceId" TEXT,
  ADD COLUMN "shopifyFulfillmentLocationId" TEXT,
  ADD COLUMN "sameDayProvisioningStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "sameDayProvisioningError" TEXT,
  ADD COLUMN "sameDayProvisioningAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "sameDayProvisionedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Seller_shopifyFulfillmentServiceId_key" ON "Seller"("shopifyFulfillmentServiceId");
CREATE UNIQUE INDEX "Seller_shopifyFulfillmentLocationId_key" ON "Seller"("shopifyFulfillmentLocationId");
