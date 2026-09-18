-- ============================================================
-- HAIRGRAB CONTROLLED SELLER RESET
-- Deletes ALL current HairGrab seller/test data.
--
-- PRESERVES:
--   Shopify app Session records
--   MarketplaceSettings
--   HairGrab Announcement records themselves
--
-- DOES NOT DELETE:
--   Shopify customers
--   Shopify orders
--   Shopify products
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- BEFORE RESET
-- ------------------------------------------------------------

SELECT
  (SELECT COUNT(*) FROM "Seller") AS sellers_before,
  (SELECT COUNT(*) FROM "SellerApplication") AS applications_before,
  (SELECT COUNT(*) FROM "SellerProduct") AS seller_products_before,
  (SELECT COUNT(*) FROM "SellerPortalAccount") AS portal_accounts_before;

-- ------------------------------------------------------------
-- RESET
--
-- CASCADE removes seller-dependent HairGrab Core records,
-- including onboarding, login tokens, storefront data,
-- reviews, favorites, merchandising, ledger/payout data,
-- fulfillment, messages, announcement reads, notifications,
-- and seller-owned product records.
-- ------------------------------------------------------------

TRUNCATE TABLE
  "SellerApplication",
  "Seller"
RESTART IDENTITY CASCADE;

-- ------------------------------------------------------------
-- AFTER RESET
-- These should all return 0.
-- ------------------------------------------------------------

SELECT
  (SELECT COUNT(*) FROM "Seller") AS sellers_after,
  (SELECT COUNT(*) FROM "SellerApplication") AS applications_after,
  (SELECT COUNT(*) FROM "SellerProduct") AS seller_products_after,
  (SELECT COUNT(*) FROM "SellerPortalAccount") AS portal_accounts_after;

COMMIT;