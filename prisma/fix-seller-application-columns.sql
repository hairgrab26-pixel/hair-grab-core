ALTER TABLE "SellerApplication"
ADD COLUMN IF NOT EXISTS "inventoryFulfillmentType" TEXT,
ADD COLUMN IF NOT EXISTS "inventoryCertificationAccepted" BOOLEAN NOT NULL DEFAULT false;