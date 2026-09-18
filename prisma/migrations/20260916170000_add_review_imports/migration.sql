-- CreateTable
CREATE TABLE "ReviewImport" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourceStoreDomain" TEXT,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT,
    "fileSha256" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "certificationAccepted" BOOLEAN NOT NULL DEFAULT false,
    "certificationPolicyVersion" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "certifiedByPortalAccountId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewDecisionReason" TEXT,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sourceReviewId" TEXT,
    "sourceProductIdentifier" TEXT,
    "sourceProductTitle" TEXT,
    "sellerProductId" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewTitle" TEXT,
    "reviewBody" TEXT,
    "reviewerDisplayName" TEXT,
    "reviewerEmail" TEXT,
    "reviewDate" TIMESTAMP(3),
    "mediaUrls" JSONB,
    "sourceVerified" BOOLEAN,
    "disclosureStatus" TEXT NOT NULL DEFAULT 'IMPORTED_NOT_HAIRGRAB_VERIFIED',
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "warningReason" TEXT,
    "dedupeFingerprint" TEXT NOT NULL,
    "sourceRowHash" TEXT,
    "approvedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "externalImportReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewImportRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewImportProductMapping" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "sourceProductIdentifier" TEXT NOT NULL,
    "sourceProductTitle" TEXT,
    "sellerProductId" TEXT,
    "matchMethod" TEXT NOT NULL DEFAULT 'MANUAL',
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewImportProductMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewImportEvent" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewImportEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewImport_importId_rowNumber_key" ON "ReviewImportRow"("importId", "rowNumber");
CREATE UNIQUE INDEX "ReviewImportProductMapping_importId_sourceProductIdentifier_key" ON "ReviewImportProductMapping"("importId", "sourceProductIdentifier");
CREATE INDEX "ReviewImport_sellerId_status_idx" ON "ReviewImport"("sellerId", "status");
CREATE INDEX "ReviewImport_sourcePlatform_createdAt_idx" ON "ReviewImport"("sourcePlatform", "createdAt");
CREATE INDEX "ReviewImport_fileSha256_idx" ON "ReviewImport"("fileSha256");
CREATE UNIQUE INDEX "ReviewImport_sellerId_fileSha256_key" ON "ReviewImport"("sellerId", "fileSha256");
CREATE INDEX "ReviewImportRow_sellerProductId_validationStatus_idx" ON "ReviewImportRow"("sellerProductId", "validationStatus");
CREATE INDEX "ReviewImportRow_dedupeFingerprint_idx" ON "ReviewImportRow"("dedupeFingerprint");
CREATE INDEX "ReviewImportRow_sourceReviewId_idx" ON "ReviewImportRow"("sourceReviewId");
CREATE INDEX "ReviewImportProductMapping_sellerProductId_idx" ON "ReviewImportProductMapping"("sellerProductId");
CREATE INDEX "ReviewImportEvent_importId_createdAt_idx" ON "ReviewImportEvent"("importId", "createdAt");
CREATE INDEX "ReviewImportEvent_toStatus_idx" ON "ReviewImportEvent"("toStatus");

ALTER TABLE "ReviewImport" ADD CONSTRAINT "ReviewImport_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewImportRow" ADD CONSTRAINT "ReviewImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ReviewImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewImportRow" ADD CONSTRAINT "ReviewImportRow_sellerProductId_fkey" FOREIGN KEY ("sellerProductId") REFERENCES "SellerProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewImportProductMapping" ADD CONSTRAINT "ReviewImportProductMapping_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ReviewImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewImportProductMapping" ADD CONSTRAINT "ReviewImportProductMapping_sellerProductId_fkey" FOREIGN KEY ("sellerProductId") REFERENCES "SellerProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewImportEvent" ADD CONSTRAINT "ReviewImportEvent_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ReviewImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
