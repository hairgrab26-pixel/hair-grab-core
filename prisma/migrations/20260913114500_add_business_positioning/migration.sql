-- Add seller-level marketplace positioning tags for HairGrab recruiting and filtering.
ALTER TABLE "Seller"
ADD COLUMN "businessPositioning" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];