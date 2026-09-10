CREATE TABLE IF NOT EXISTS "CustomerFavorite" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "shopifyCustomerId" TEXT NOT NULL,
  "sellerProductId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerFavorite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerFavorite_sellerProductId_fkey"
    FOREIGN KEY ("sellerProductId")
    REFERENCES "SellerProduct"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerFavorite_shop_shopifyCustomerId_sellerProductId_key"
  ON "CustomerFavorite"("shop", "shopifyCustomerId", "sellerProductId");

CREATE INDEX IF NOT EXISTS "CustomerFavorite_shopifyCustomerId_idx"
  ON "CustomerFavorite"("shopifyCustomerId");

CREATE INDEX IF NOT EXISTS "CustomerFavorite_sellerProductId_idx"
  ON "CustomerFavorite"("sellerProductId");

CREATE INDEX IF NOT EXISTS "CustomerFavorite_createdAt_idx"
  ON "CustomerFavorite"("createdAt");
