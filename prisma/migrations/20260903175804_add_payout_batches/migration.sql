-- CreateTable
CREATE TABLE "PayoutBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchCode" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "externalPayoutId" TEXT,
    "failureReason" TEXT,
    "scheduledFor" DATETIME,
    "processedAt" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayoutBatch_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayoutBatchItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payoutBatchId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutBatchItem_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "PayoutBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayoutBatchItem_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "SellerLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_batchCode_key" ON "PayoutBatch"("batchCode");

-- CreateIndex
CREATE INDEX "PayoutBatch_sellerId_idx" ON "PayoutBatch"("sellerId");

-- CreateIndex
CREATE INDEX "PayoutBatch_status_idx" ON "PayoutBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatchItem_ledgerEntryId_key" ON "PayoutBatchItem"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "PayoutBatchItem_payoutBatchId_idx" ON "PayoutBatchItem"("payoutBatchId");
