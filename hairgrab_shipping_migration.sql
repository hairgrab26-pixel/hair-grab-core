-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PayoutBatch";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PayoutBatchItem";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Seller";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SellerLedgerEntry";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Session";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "SellerApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "businessName" TEXT NOT NULL,
    "contactFirstName" TEXT NOT NULL,
    "contactLastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "tiktok" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "yearsInBusiness" TEXT,
    "productCountRange" TEXT,
    "canImportCsv" BOOLEAN,
    "sellsNationwide" BOOLEAN NOT NULL DEFAULT true,
    "offersLocalPickup" BOOLEAN NOT NULL DEFAULT false,
    "offersLocalDelivery" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "adminReviewNotes" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "approvedAt" DATETIME,
    "declinedAt" DATETIME,
    "approvedSellerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerApplication_approvedSellerId_fkey" FOREIGN KEY ("approvedSellerId") REFERENCES "Seller" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerCode" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "legalBusinessName" TEXT,
    "contactFirstName" TEXT,
    "contactLastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "tiktok" TEXT,
    "storeSlug" TEXT,
    "storeDescription" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "sellsNationwide" BOOLEAN NOT NULL DEFAULT true,
    "nationwideShippingMethod" TEXT NOT NULL DEFAULT 'SELLER_MANAGED',
    "offersLocalPickup" BOOLEAN NOT NULL DEFAULT false,
    "offersLocalDelivery" BOOLEAN NOT NULL DEFAULT false,
    "returnPolicy" TEXT NOT NULL DEFAULT '14_DAY_RETURNS',
    "shopifyVendor" TEXT NOT NULL,
    "nexusSellerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "commissionRate" REAL NOT NULL DEFAULT 7,
    "activeProductLimit" INTEGER NOT NULL DEFAULT 50,
    "payoutStatus" TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
    "stripeAccountId" TEXT,
    "payoutTier" TEXT NOT NULL DEFAULT 'STANDARD',
    "successfulDeliveredOrders" INTEGER NOT NULL DEFAULT 0,
    "fastPayoutEligibleAt" DATETIME,
    "fastPayoutUnlockedAt" DATETIME,
    "fastPayoutSuspendedAt" DATETIME,
    "fastPayoutSuspensionReason" TEXT,
    "approvedAt" DATETIME,
    "suspendedAt" DATETIME,
    "deactivatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SellerOnboarding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL DEFAULT 'BUSINESS',
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "businessComplete" BOOLEAN NOT NULL DEFAULT false,
    "storefrontComplete" BOOLEAN NOT NULL DEFAULT false,
    "fulfillmentComplete" BOOLEAN NOT NULL DEFAULT false,
    "returnsComplete" BOOLEAN NOT NULL DEFAULT false,
    "payoutsComplete" BOOLEAN NOT NULL DEFAULT false,
    "agreementsComplete" BOOLEAN NOT NULL DEFAULT false,
    "productsComplete" BOOLEAN NOT NULL DEFAULT false,
    "businessCompletedAt" DATETIME,
    "storefrontCompletedAt" DATETIME,
    "fulfillmentCompletedAt" DATETIME,
    "returnsCompletedAt" DATETIME,
    "payoutsCompletedAt" DATETIME,
    "agreementsCompletedAt" DATETIME,
    "productsCompletedAt" DATETIME,
    "startedAt" DATETIME,
    "lastSavedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerOnboarding_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerPortalAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "emailVerifiedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerPortalAccount_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerLoginToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portalAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SellerLoginToken_portalAccountId_fkey" FOREIGN KEY ("portalAccountId") REFERENCES "SellerPortalAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "shopifyProductId" TEXT,
    "shopifyHandle" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sellerSku" TEXT,
    "publishedToShopify" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerProduct_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
    "fundsStatus" TEXT NOT NULL DEFAULT 'AWAITING_CLEARANCE',
    "fundsClearedAt" DATETIME,
    "shopifyFulfillmentId" TEXT,
    "deliveredAt" DATETIME,
    "availableOn" DATETIME,
    "eligibilityCheckedAt" DATETIME,
    "paidAt" DATETIME,
    "shopifyCreatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerLedgerEntry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerDeliveredOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT,
    "shopifyFulfillmentId" TEXT,
    "deliveredAt" DATETIME NOT NULL,
    "qualificationCountedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerDeliveredOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "MarketplaceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'hairgrab',
    "standardCommissionRate" REAL NOT NULL DEFAULT 7,
    "foundingSellerCommissionRate" REAL NOT NULL DEFAULT 5,
    "defaultActiveProductLimit" INTEGER NOT NULL DEFAULT 50,
    "sellerApplicationsOpen" BOOLEAN NOT NULL DEFAULT true,
    "requireSellerApproval" BOOLEAN NOT NULL DEFAULT true,
    "requireProductApproval" BOOLEAN NOT NULL DEFAULT true,
    "productPublishingPaused" BOOLEAN NOT NULL DEFAULT false,
    "defaultShippingSlaHours" INTEGER NOT NULL DEFAULT 48,
    "defaultReturnPolicy" TEXT NOT NULL DEFAULT '14_DAY_RETURNS',
    "localPickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "localDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supportEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SellerOrderFulfillment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT,
    "fulfillmentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shippingLabelUrl" TEXT,
    "shippingRateId" TEXT,
    "shippingCostCents" INTEGER,
    "shippingPurchaseId" TEXT,
    "shippingPurchaseStatus" TEXT,
    "shippingPurchaseError" TEXT,
    "packageType" TEXT,
    "packageLengthInches" REAL,
    "packageWidthInches" REAL,
    "packageHeightInches" REAL,
    "packageWeightOunces" REAL,
    "shippingLabelPurchasedAt" DATETIME,
    "courierProvider" TEXT,
    "courierDeliveryId" TEXT,
    "courierStatus" TEXT,
    "courierFeeCents" INTEGER,
    "readyForPickupAt" DATETIME,
    "shippedAt" DATETIME,
    "deliveredAt" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerOrderFulfillment_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerApplication_approvedSellerId_key" ON "SellerApplication"("approvedSellerId");

-- CreateIndex
CREATE INDEX "SellerApplication_status_idx" ON "SellerApplication"("status");

-- CreateIndex
CREATE INDEX "SellerApplication_email_idx" ON "SellerApplication"("email");

-- CreateIndex
CREATE INDEX "SellerApplication_businessName_idx" ON "SellerApplication"("businessName");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_sellerCode_key" ON "Seller"("sellerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_storeSlug_key" ON "Seller"("storeSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_shopifyVendor_key" ON "Seller"("shopifyVendor");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_nexusSellerId_key" ON "Seller"("nexusSellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_stripeAccountId_key" ON "Seller"("stripeAccountId");

-- CreateIndex
CREATE INDEX "Seller_status_idx" ON "Seller"("status");

-- CreateIndex
CREATE INDEX "Seller_email_idx" ON "Seller"("email");

-- CreateIndex
CREATE INDEX "Seller_businessName_idx" ON "Seller"("businessName");

-- CreateIndex
CREATE INDEX "Seller_payoutTier_idx" ON "Seller"("payoutTier");

-- CreateIndex
CREATE UNIQUE INDEX "SellerOnboarding_sellerId_key" ON "SellerOnboarding"("sellerId");

-- CreateIndex
CREATE INDEX "SellerOnboarding_status_idx" ON "SellerOnboarding"("status");

-- CreateIndex
CREATE INDEX "SellerOnboarding_currentStep_idx" ON "SellerOnboarding"("currentStep");

-- CreateIndex
CREATE UNIQUE INDEX "SellerPortalAccount_email_key" ON "SellerPortalAccount"("email");

-- CreateIndex
CREATE INDEX "SellerPortalAccount_sellerId_idx" ON "SellerPortalAccount"("sellerId");

-- CreateIndex
CREATE INDEX "SellerPortalAccount_status_idx" ON "SellerPortalAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SellerLoginToken_tokenHash_key" ON "SellerLoginToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SellerLoginToken_portalAccountId_idx" ON "SellerLoginToken"("portalAccountId");

-- CreateIndex
CREATE INDEX "SellerLoginToken_expiresAt_idx" ON "SellerLoginToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProduct_shopifyProductId_key" ON "SellerProduct"("shopifyProductId");

-- CreateIndex
CREATE INDEX "SellerProduct_sellerId_idx" ON "SellerProduct"("sellerId");

-- CreateIndex
CREATE INDEX "SellerProduct_status_idx" ON "SellerProduct"("status");

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

-- CreateIndex
CREATE INDEX "SellerLedgerEntry_fundsStatus_idx" ON "SellerLedgerEntry"("fundsStatus");

-- CreateIndex
CREATE INDEX "SellerLedgerEntry_availableOn_idx" ON "SellerLedgerEntry"("availableOn");

-- CreateIndex
CREATE INDEX "SellerLedgerEntry_deliveredAt_idx" ON "SellerLedgerEntry"("deliveredAt");

-- CreateIndex
CREATE INDEX "SellerLedgerEntry_shopifyFulfillmentId_idx" ON "SellerLedgerEntry"("shopifyFulfillmentId");

-- CreateIndex
CREATE INDEX "SellerDeliveredOrder_sellerId_idx" ON "SellerDeliveredOrder"("sellerId");

-- CreateIndex
CREATE INDEX "SellerDeliveredOrder_shopifyOrderId_idx" ON "SellerDeliveredOrder"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "SellerDeliveredOrder_deliveredAt_idx" ON "SellerDeliveredOrder"("deliveredAt");

-- CreateIndex
CREATE INDEX "SellerDeliveredOrder_qualificationCountedAt_idx" ON "SellerDeliveredOrder"("qualificationCountedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerDeliveredOrder_sellerId_shopifyOrderId_key" ON "SellerDeliveredOrder"("sellerId", "shopifyOrderId");

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

-- CreateIndex
CREATE INDEX "SellerOrderFulfillment_sellerId_idx" ON "SellerOrderFulfillment"("sellerId");

-- CreateIndex
CREATE INDEX "SellerOrderFulfillment_shopifyOrderId_idx" ON "SellerOrderFulfillment"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "SellerOrderFulfillment_fulfillmentMethod_idx" ON "SellerOrderFulfillment"("fulfillmentMethod");

-- CreateIndex
CREATE INDEX "SellerOrderFulfillment_status_idx" ON "SellerOrderFulfillment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SellerOrderFulfillment_sellerId_shopifyOrderId_key" ON "SellerOrderFulfillment"("sellerId", "shopifyOrderId");

