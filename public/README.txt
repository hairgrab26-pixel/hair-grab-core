HAIRGRAB SELLER DASHBOARD + HOMEPAGE MERCHANDISING UPDATE

This package preserves the existing seller dashboard/order-alert behavior and adds the seller financial report, larger HairGrab branding, and the finalized homepage merchandising workflow.

FILES
- app/routes/seller._index.tsx
- app/routes/seller.help.tsx
- app/routes/seller.financials.tsx
- app/routes/seller.picks.tsx
- app/routes/app._index.tsx
- app/routes/app.homepage-merchandising.tsx
- app/routes/api.homepage-merchandising.ts
- public/hairgrab-logo.png
- prisma/migrations/20260910_seller_featured_products/migration.sql

WHAT THIS VERSION DOES
1. Seller dashboard uses the larger, tightly-cropped official HairGrab logo.
2. Financials includes View / Export Financial Report.
   - From / To date filters
   - transaction type filters: SALE, REFUND, ADJUSTMENT, PAYOUT
   - filtered totals and transaction detail
   - CSV export using the selected filters
3. Seller Picks
   - seller chooses up to 5 ACTIVE products
   - seller can change them any time
   - selection is stored in SellerHomepagePick
   - wording clearly does NOT promise Featured placement
4. HairGrab Homepage Merchandising admin page
   - /app/homepage-merchandising
   - shows exactly what every seller chose
   - HairGrab can promote a Seller Pick OR any active product to Featured Products
   - Featured Products capped at 12
   - HairGrab can remove products from Featured
5. New Arrivals
   - automatic from newest ACTIVE HairGrab products
   - seller does not choose them
   - admin does not need to maintain them
6. Fair Seller Picks rotation
   - public merchandising feed interleaves sellers instead of filling the section with one seller first
7. Public merchandising feed
   - /api/homepage-merchandising
   - returns featuredProducts, newArrivals, sellerPicks
   - intended for the Shopify HairGrab homepage to consume when the storefront section is wired

IMPORTANT
This package creates two small merchandising tables. Run the migration before opening Seller Picks or Homepage Merchandising in production.

The Shopify public homepage itself is NOT rewritten by this package. This creates the HairGrab Core merchandising source of truth and public feed so the storefront can be connected cleanly without hard-coding seller choices into Shopify.

Forum/community is intentionally NOT included in this build. It remains a post-launch roadmap item because it requires moderation, seller conduct rules and community administration.
