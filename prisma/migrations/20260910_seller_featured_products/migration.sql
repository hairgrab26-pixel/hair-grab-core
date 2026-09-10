-- HairGrab homepage merchandising
-- Sellers choose up to 5 Seller Picks. HairGrab controls the Featured Products section.

CREATE TABLE IF NOT EXISTS "SellerHomepagePick" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "sellerProductId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerHomepagePick_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SellerHomepagePick_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SellerHomepagePick_sellerProductId_fkey" FOREIGN KEY ("sellerProductId") REFERENCES "SellerProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SellerHomepagePick_sellerId_sellerProductId_key"
  ON "SellerHomepagePick"("sellerId", "sellerProductId");

CREATE INDEX IF NOT EXISTS "SellerHomepagePick_sellerId_rank_idx"
  ON "SellerHomepagePick"("sellerId", "rank");

CREATE TABLE IF NOT EXISTS "HomepageFeaturedProduct" (
  "id" TEXT NOT NULL,
  "sellerProductId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomepageFeaturedProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HomepageFeaturedProduct_sellerProductId_fkey" FOREIGN KEY ("sellerProductId") REFERENCES "SellerProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "HomepageFeaturedProduct_sellerProductId_key"
  ON "HomepageFeaturedProduct"("sellerProductId");

CREATE INDEX IF NOT EXISTS "HomepageFeaturedProduct_rank_idx"
  ON "HomepageFeaturedProduct"("rank");
