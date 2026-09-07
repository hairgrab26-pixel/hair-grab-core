ALTER TABLE "Seller"
    DROP COLUMN IF EXISTS "website",
    DROP COLUMN IF EXISTS "instagram",
    DROP COLUMN IF EXISTS "tiktok",
    ADD COLUMN IF NOT EXISTS "offersSameDayDelivery" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SellerApplication"
    DROP COLUMN IF EXISTS "website",
    DROP COLUMN IF EXISTS "instagram",
    DROP COLUMN IF EXISTS "tiktok",
    ADD COLUMN IF NOT EXISTS "offersSameDayDelivery" BOOLEAN NOT NULL DEFAULT false;