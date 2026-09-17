-- Forward-only: adds a nullable IANA timezone identifier used to evaluate
-- SellerStoreHour rows in local time (see app/store-hours.server.ts).
-- Existing sellers keep NULL until they save a timezone in Settings; the
-- settings UI requires one before store hours can be saved/enabled, and
-- sellerIsOpenAt() fails CLOSED (never assumes open) when it is missing.
ALTER TABLE "Seller" ADD COLUMN "timezone" TEXT;
