HAIRGRAB CUSTOMER FAVORITES — INSTALL ORDER

This package adds:
1) CustomerFavorite Prisma model
2) Production migration SQL
3) Signed Shopify app-proxy endpoint at /favorites-proxy
4) Working ♡ / ♥ favorite button on every Dawn product card
5) Optional visual hooks:
   - 🔥 when product metafield hairgrab.trending = true
   - HG when product metafield hairgrab.featured = true

IMPORTANT:
- This package does NOT remove Catalog Inventory or Homepage Merchandising.
- Do NOT use git add .
- The customer-account Favorites page itself is a separate Shopify Customer Account UI extension.
  The heart saving/persistence is completed here first.

CORE FILES:
- prisma/schema.prisma
- prisma/migrations/20260910_customer_favorites/migration.sql
- app/routes/favorites-proxy.tsx

SHOPIFY THEME FILE:
- theme/snippets/card-product.liquid
  Copy its full contents into Online Store > Themes > Edit code > snippets/card-product.liquid

APP PROXY ALREADY CONFIGURED:
- /apps/hairgrab-favorites -> /favorites-proxy

INSTALL CORE:
1. Copy package app/ and prisma/ folders into C:\Users\crown\hair-grab-core
2. Run:
   npx prisma format
   npx prisma generate
   npm run build
3. Apply the SQL migration to Railway Postgres.
4. Stage only:
   git add app\routes\favorites-proxy.tsx
   git add prisma\schema.prisma
   git add prisma\migrations\20260910_customer_favorites\migration.sql
   git add shopify.app.toml
5. Commit/push after database migration is confirmed.

THEME:
Replace only snippets/card-product.liquid with the provided complete replacement.
