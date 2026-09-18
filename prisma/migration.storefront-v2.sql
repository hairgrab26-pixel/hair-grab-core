-- HairGrab Storefront v2
-- Custom collections, gallery/media, business hours, visibility controls, reviews.

ALTER TABLE "Seller"
  ADD COLUMN "showFeaturedCollection" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showNewArrivalsCollection" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showOnSaleCollection" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showCustomCollections" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showGallery" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showReviews" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "storeOpenOverride" TEXT NOT NULL DEFAULT 'AUTO';

CREATE TABLE "SellerStoreCollection" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "imageUrl" TEXT,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "rank" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellerStoreCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellerStoreCollectionProduct" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "sellerProductId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerStoreCollectionProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellerStoreMedia" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "altText" TEXT,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "rank" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellerStoreMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellerStoreHour" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "openTime" TEXT,
  "closeTime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellerStoreHour_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellerReview" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "shopifyCustomerId" TEXT,
  "shopifyOrderId" TEXT,
  "rating" INTEGER NOT NULL,
  "title" TEXT,
  "body" TEXT,
  "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellerReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductReview" (
  "id" TEXT NOT NULL,
  "sellerProductId" TEXT NOT NULL,
  "shopifyCustomerId" TEXT,
  "shopifyOrderId" TEXT,
  "rating" INTEGER NOT NULL,
  "title" TEXT,
  "body" TEXT,
  "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerStoreCollection_sellerId_slug_key"
  ON "SellerStoreCollection"("sellerId", "slug");
CREATE INDEX "SellerStoreCollection_sellerId_rank_idx"
  ON "SellerStoreCollection"("sellerId", "rank");
CREATE INDEX "SellerStoreCollection_sellerId_isVisible_idx"
  ON "SellerStoreCollection"("sellerId", "isVisible");

CREATE UNIQUE INDEX "SellerStoreCollectionProduct_collectionId_sellerProductId_key"
  ON "SellerStoreCollectionProduct"("collectionId", "sellerProductId");
CREATE INDEX "SellerStoreCollectionProduct_collectionId_rank_idx"
  ON "SellerStoreCollectionProduct"("collectionId", "rank");
CREATE INDEX "SellerStoreCollectionProduct_sellerProductId_idx"
  ON "SellerStoreCollectionProduct"("sellerProductId");

CREATE INDEX "SellerStoreMedia_sellerId_rank_idx"
  ON "SellerStoreMedia"("sellerId", "rank");
CREATE INDEX "SellerStoreMedia_sellerId_isVisible_idx"
  ON "SellerStoreMedia"("sellerId", "isVisible");

CREATE UNIQUE INDEX "SellerStoreHour_sellerId_dayOfWeek_key"
  ON "SellerStoreHour"("sellerId", "dayOfWeek");
CREATE INDEX "SellerStoreHour_sellerId_idx"
  ON "SellerStoreHour"("sellerId");

CREATE INDEX "SellerReview_sellerId_status_idx"
  ON "SellerReview"("sellerId", "status");
CREATE INDEX "SellerReview_shopifyCustomerId_idx"
  ON "SellerReview"("shopifyCustomerId");
CREATE INDEX "SellerReview_shopifyOrderId_idx"
  ON "SellerReview"("shopifyOrderId");

CREATE INDEX "ProductReview_sellerProductId_status_idx"
  ON "ProductReview"("sellerProductId", "status");
CREATE INDEX "ProductReview_shopifyCustomerId_idx"
  ON "ProductReview"("shopifyCustomerId");
CREATE INDEX "ProductReview_shopifyOrderId_idx"
  ON "ProductReview"("shopifyOrderId");

ALTER TABLE "SellerStoreCollection"
  ADD CONSTRAINT "SellerStoreCollection_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerStoreCollectionProduct"
  ADD CONSTRAINT "SellerStoreCollectionProduct_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "SellerStoreCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerStoreCollectionProduct"
  ADD CONSTRAINT "SellerStoreCollectionProduct_sellerProductId_fkey"
  FOREIGN KEY ("sellerProductId") REFERENCES "SellerProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerStoreMedia"
  ADD CONSTRAINT "SellerStoreMedia_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerStoreHour"
  ADD CONSTRAINT "SellerStoreHour_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerReview"
  ADD CONSTRAINT "SellerReview_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductReview"
  ADD CONSTRAINT "ProductReview_sellerProductId_fkey"
  FOREIGN KEY ("sellerProductId") REFERENCES "SellerProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
