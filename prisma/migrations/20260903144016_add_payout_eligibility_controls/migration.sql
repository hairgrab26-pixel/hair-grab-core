-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SellerLedgerEntry" (
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
    "fundsStatus" TEXT NOT NULL DEFAULT 'AWAITING_CLEARANCE',
    "fundsClearedAt" DATETIME,
    "availableOn" DATETIME,
    "eligibilityCheckedAt" DATETIME,
    "paidAt" DATETIME,
    "shopifyCreatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerLedgerEntry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SellerLedgerEntry" ("availableOn", "commissionAmountCents", "commissionRate", "createdAt", "currency", "description", "entryType", "grossAmountCents", "id", "idempotencyKey", "paidAt", "payoutAmountCents", "refundAmountCents", "sellerEarningsCents", "sellerId", "shopifyCreatedAt", "shopifyLineItemId", "shopifyOrderId", "shopifyOrderName", "status", "updatedAt") SELECT "availableOn", "commissionAmountCents", "commissionRate", "createdAt", "currency", "description", "entryType", "grossAmountCents", "id", "idempotencyKey", "paidAt", "payoutAmountCents", "refundAmountCents", "sellerEarningsCents", "sellerId", "shopifyCreatedAt", "shopifyLineItemId", "shopifyOrderId", "shopifyOrderName", "status", "updatedAt" FROM "SellerLedgerEntry";
DROP TABLE "SellerLedgerEntry";
ALTER TABLE "new_SellerLedgerEntry" RENAME TO "SellerLedgerEntry";
CREATE UNIQUE INDEX "SellerLedgerEntry_idempotencyKey_key" ON "SellerLedgerEntry"("idempotencyKey");
CREATE INDEX "SellerLedgerEntry_sellerId_idx" ON "SellerLedgerEntry"("sellerId");
CREATE INDEX "SellerLedgerEntry_shopifyOrderId_idx" ON "SellerLedgerEntry"("shopifyOrderId");
CREATE INDEX "SellerLedgerEntry_status_idx" ON "SellerLedgerEntry"("status");
CREATE INDEX "SellerLedgerEntry_entryType_idx" ON "SellerLedgerEntry"("entryType");
CREATE INDEX "SellerLedgerEntry_fundsStatus_idx" ON "SellerLedgerEntry"("fundsStatus");
CREATE INDEX "SellerLedgerEntry_availableOn_idx" ON "SellerLedgerEntry"("availableOn");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
