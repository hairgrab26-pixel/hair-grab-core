-- CreateTable
CREATE TABLE "SellerLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT,
    "shopifyLineItemId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "entryType" TEXT NOT NULL DEFAULT 'SALE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "commissionRate" REAL NOT NULL,
    "grossAmountCents" INTEGER NOT NULL DEFAULT 0,
    "commissionAmountCents" INTEGER NOT NULL DEFAULT 0,
    "sellerEarningsCents" INTEGER NOT NULL DEFAULT 0,
    "refundAmountCents" INTEGER NOT NULL DEFAULT 0,
    "payoutAmountCents" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "availableOn" DATETIME,
    "paidAt" DATETIME,
    "shopifyCreatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerLedgerEntry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerLedgerEntry_idempotencyKey_key" ON "SellerLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SellerLedgerEntry_sellerId_idx" ON "SellerLedgerEntry"("sellerId");

-- CreateIndex
CREATE INDEX "SellerLedgerEntry_shopifyOrderId_idx" ON "SellerLedgerEntry"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "SellerLedgerEntry_status_idx" ON "SellerLedgerEntry"("status");

-- CreateIndex
CREATE INDEX "SellerLedgerEntry_entryType_idx" ON "SellerLedgerEntry"("entryType");
