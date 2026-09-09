-- HairGrab seller-owned Shopify store connection.
-- This table is separate from HairGrab's own Shopify Session table.

CREATE TABLE "SellerShopifyConnection" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopName" TEXT,
    "accessTokenEncrypted" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "scopes" TEXT,
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerShopifyConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerShopifyConnection_sellerId_key"
ON "SellerShopifyConnection"("sellerId");

CREATE UNIQUE INDEX "SellerShopifyConnection_shopDomain_key"
ON "SellerShopifyConnection"("shopDomain");

CREATE INDEX "SellerShopifyConnection_status_idx"
ON "SellerShopifyConnection"("status");

CREATE INDEX "SellerShopifyConnection_shopDomain_idx"
ON "SellerShopifyConnection"("shopDomain");

ALTER TABLE "SellerShopifyConnection"
ADD CONSTRAINT "SellerShopifyConnection_sellerId_fkey"
FOREIGN KEY ("sellerId")
REFERENCES "Seller"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
