-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerCode" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "shopifyVendor" TEXT NOT NULL,
    "nexusSellerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "commissionRate" REAL NOT NULL DEFAULT 10,
    "stripeAccountId" TEXT,
    "payoutStatus" TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Seller_sellerCode_key" ON "Seller"("sellerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_shopifyVendor_key" ON "Seller"("shopifyVendor");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_nexusSellerId_key" ON "Seller"("nexusSellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_stripeAccountId_key" ON "Seller"("stripeAccountId");
