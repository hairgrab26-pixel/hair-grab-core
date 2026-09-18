# HairGrab Category-Specific Advanced Search & Filtering — Phase 1 Read-Only Audit

**Scope:** Read-only inspection of two local folders only — `hair-grab-core` (HairGrab Core app) and `hairgrab-shopify-theme` (Dawn-based storefront theme). No Shopify Admin, no live database rows, no Judge.me API, no authenticated admin sessions were accessed. Everything below is either (a) read directly from local source, or (b) explicitly marked **"Not verified from local code"** where Shopify Admin / live-store access would be required.

---

## STEP 0

1. **Folders accessible:** Both were granted in a single approval prompt and both were readable for this audit:
   `C:\Users\crown\hair-grab-core` and `C:\Users\crown\hairgrab-shopify-theme`.
2. **Confirmed:** this is a local-code-only audit. No `.env`, no `dev.sqlite` (a local database file present in `prisma/`), no Shopify Admin session, and no Judge.me endpoint were opened or queried, per your access boundaries.
3. **Sections that cannot be fully verified from local code alone** (all marked below and requiring Shopify Admin / Partner Dashboard read access, or a data export, to close):
   - Live Shopify metafield **definitions** (their actual namespaces, keys, "choices" validation lists, and product-vs-variant scoping) — the code reads these *dynamically at runtime*, so the authoritative list lives in Shopify Admin, not in this repo.
   - Live Shopify **collections** and their automated-collection rules/conditions.
   - Live **Search & Discovery** app configuration (which filters are enabled, in what order, for which collections).
   - Actual **live product data** (how many products, how consistently tagged/typed they already are) — `app/routes/app.product-category-audit.tsx` is a read-only staff tool that would answer this, but running it requires an authenticated admin session, which is out of bounds for Phase 1.
   - Whether **Judge.me** review data is the same data shown via the internal `ProductReview`/`ReviewImportRow` tables (see item 20) — this needs confirmation from someone with Judge.me admin access, not code.
   - `theme.check` / theme-store validation state, and any settings inside `config/settings_data.json` beyond what's visible as static JSON (app-embed block configuration for Judge.me specifically was not located by keyword search in that file — see item 24).
4. Proceeding with everything the local files support.

---

## 1. Current architecture summary

HairGrab is two connected codebases:

- **HairGrab Core** (`hair-grab-core`) — a Shopify-embedded admin/seller app built on React Router 7 ("Remix-style" file routes), Prisma 6 + PostgreSQL, and the Shopify App/Admin GraphQL API. It has two audiences: HairGrab staff routes (`app.*.tsx`) and seller-portal routes (`seller.*.tsx`). It holds marketplace bookkeeping (sellers, payouts, ledger, fulfillment, reviews-import pipeline) but **does not store shopper-facing product attributes in its own database** — see item 4.
- **hairgrab-shopify-theme** — a customized Dawn theme that is the actual storefront. It renders products, collections, and search results, and currently runs **two different, disconnected filtering systems** (see item 3).

The two are connected only by: (a) HairGrab Core writing products, variants, tags, and metafields into the merchant's Shopify catalog via Admin GraphQL mutations when a seller adds/edits a product, and (b) a public JSON API (`api.product-discovery.ts`) that HairGrab Core exposes for the theme's search page to call. There is no message queue, webhook-driven sync, or shared database between the two — Shopify itself is the shared source of truth for product data once a product is created.

## 2. Current category-routing map

| Circle label (today) | Links to | Backing mechanism |
|---|---|---|
| Wigs | `/collections/wigs` | Native Shopify collection |
| Bundles | `/collections/bundles` | Native Shopify collection |
| Clip-Ins | `/collections/clip-ins` | Native Shopify collection |
| Tape-Ins | `/collections/tape-ins` | Native Shopify collection |
| Closures | `/collections/closures` | Native Shopify collection |
| Hair Essentials | `/collections/hair-essentials` | Native Shopify collection |
| More | `/collections/all` | Native "all products" collection |

These are **hardcoded `<a href>` links** in `sections/hairgrab-shop-categories.liquid` (see item 3), not driven by a menu, metafield, or config file. Whether each of these seven collections is manual or automated (rule-based), and what its rules are, is **not verified from local code** — that lives in Shopify Admin.

Separately, and only on the **search results page**, `snippets/hairgrab-discovery.liquid` defines its own category button list, hardcoded in `assets/hairgrab-discovery.js` line 14: `Wigs, Bundles, Closures & Frontals, Extensions, Braiding Hair, Locs, Hair Essentials` (7 buttons, using older "Closures & Frontals" naming, and treating "Locs" as its own top-level category rather than a sub-classification). **This list already drifts from both the current circle set and from the canonical `product-categories.ts` module** (item 4) — a concrete instance of the duplication risk the codebase's own comments warn about.

## 3. Current homepage and Shop-page circle implementations

There is exactly **one** circles component: the section `sections/hairgrab-shop-categories.liquid`. It is placed via `templates/collection.json` (order: `banner → hairgrab-shop-categories → product-grid → custom_liquid_bT9tVF`), so it currently renders **at the top of every collection page**, not (as far as this repo shows) the homepage. `templates/index.json` was inspected and does **not** reference `hairgrab-shop-categories` — a grep for the section's handle across `templates/index.json` returned no match. **This means the "homepage circles" and "Shop-page circles" described in your brief may currently be the same single component only if a collection page (e.g., `/collections/all`) is being used as the de facto "Shop" page — there is no separate dedicated circles instance on the true homepage template.** This should be confirmed against what's actually live (Phase 1 cannot start a server or view the theme editor), since it affects how many places the revised 7 circles need to be placed.

The component itself: a flex/grid row of 7 circular `<img>` thumbnails inside `<a>` tags, styled inline in the same file (purple/champagne palette consistent with your brand: `border: 1.5px solid #5B2A86`, `background:#F7F2FA`). Mobile behavior at `≤749px` switches to horizontal scroll with hidden scrollbar — this already satisfies your "mobile-friendly horizontal scrolling" requirement structurally. Each circle has `alt` text and is a real `<a href>` (keyboard-reachable, native focus ring not explicitly overridden — no visible focus-state styling was added, so it likely falls back to the browser/theme default, which should be re-checked visually in Phase 2, not assumed accessible). No ARIA `role` issues found; markup is a standard anchor list.

**Second, separate, and currently orphaned in production templates:** `snippets/hairgrab-discovery.liquid` contains its own inline `<nav class="hg-discovery__categories">` with 7 category filter buttons (not circles — plain text buttons), populated entirely by JS. As detailed in item 3 of the architecture section and item 6 below, this is rendered **only** by `sections/main-search.liquid` (confirmed via `{% render 'hairgrab-discovery' %}` at line 1 of that file) — it is not part of the homepage or the collection-page circle experience at all today.

## 4. Current product-data inventory

This is the single most important structural finding for the whole project: **`SellerProduct` in Prisma has almost no shopper-facing attribute columns.** Its fields are limited to `id, sellerId, shopifyProductId, shopifyHandle, title, status, sellerSku, publishedToShopify, publishedAt` plus relations (reviews, homepage picks, favorites). There is **no** `category`, `texture`, `length`, `color`, `laceType`, `capSize`, etc. column anywhere in `prisma/schema.prisma`.

**All shopper-facing structured attributes live in Shopify itself**, split three ways:
- **`productType`** (Shopify's native field) — the top-level category. A dedicated module, `app/product-categories.ts`, is the declared single source of truth: 6 canonical `ProductType` enum values (`WIG, BUNDLE, CLOSURE_FRONTAL, EXTENSION, BRAIDING_HAIR, HAIR_ESSENTIAL`) mapped to 6 canonical display labels (`Wigs, Bundles, Closures & Frontals, Extensions, Braiding Hair, Hair Essentials`). This was added recently (its own comment references a "Phase 3 product-system repair" for a "Wigs category didn't work while Bundles did" bug caused by duplicated category logic) and is genuinely well-designed for its purpose: it also exports a tolerant `normalizeProductCategory()` for cleaning up drifted historical values.
- **Shopify product tags** — used for a small set of cross-cutting classifications: `"Kosher Wig"`, `"Medical Wig"`, `"Locs"` (current), with `"Crochet Hair"` and `"Locs / Locks"` explicitly tracked as **legacy** tag spellings still expected to exist on some products (`LEGACY_CLASSIFICATION_TAGS` in `seller.edit-product.$productId.tsx`). A lookup table (`CLASSIFICATION_TAGS_BY_CATEGORY`) already restricts Kosher/Medical Wig to Wigs and Locs to Braiding Hair — i.e., **category-conditional classification tags are already implemented**, which maps directly onto your Medical/Kosher Wig requirement.
- **Shopify product metafields**, resolved dynamically at save/load time against live metafield **definitions** by matching human-readable names (`"Texture"`, `"Color"`, `"Density"`, `"Lace Size"`, `"Lace Type"`, `"Cap Type"`/`"Cap Size"`, `"Hair Type"`/`"Material"`, `"Ships Within"`, `"Return Policy"`, `"Show on HairGrab Map"`), plus a small set of fixed `namespace: "hairgrab"` keys written directly (`shipping_charge_type`, `loc_type`, `local_pickup_available`, `local_delivery_available`, `flat_rate_shipping`). This name-matching + "choices" validation approach (in `seller.edit-product.$productId.tsx`) means Shopify's own metafield definitions are already the intended enforcement point for controlled vocabularies — a genuinely solid foundation, but it also means **the actual current choice lists are not visible from code** (Step 0, gap 1).

The **seller-form-side canonical vocabulary** (`app/components/ProductBuilder.tsx`) is fully enumerated in code and is the best available proxy for "current allowed values" pending Admin confirmation:
- Product types (6, matching `product-categories.ts`)
- Per-type "product options" (sub-styles): Wig → Glueless/Lace/Closure Wig/Frontal Wig/Full Lace/Headband; Bundle → Single Bundle/Bundle Deal/Weft/No Weft/With Closure/With Frontal; Closure/Frontal → Closure/Frontal/360 Frontal; Extension → Clip-Ins/Tape-Ins/I-Tips-Microlinks/Ponytail/Halo; Braiding Hair → Pre-Stretched/Boho-Loose Curl; Hair Essential → Hair Care/Tools/Accessories
- Classifications (tags): Wig → Kosher Wig/Medical Wig; Braiding Hair → Locs
- `installationMethodChoices`: Crochet, Pre-Looped
- `locTypeChoices`: 10 named loc styles (Butterfly, Faux, Goddess, Soft, Distressed, Boho, Marley, Wavy/Curly, Traditional, Other)
- `materials`: Human Hair / Synthetic Hair / Human-Synthetic Blend / Other / Not Applicable
- `colors`: 15 named shades (numbered scheme, e.g. "1B", "27", "613", plus named colors and "Other/Custom")
- `textures`: 10 values (Straight → Coily → Other)
- `standardLengths`: 8"–40" in 2" steps
- `densities`: 130%–250%
- `laceSizes`: 2x6, 4x4, 5x5, 6x6, 7x7, 13x4, 13x6, 360, Full Lace
- `laceTypes`: HD Lace, Transparent Lace, Swiss Lace, Regular Lace

**Not found anywhere in code** (gaps against your requested filter matrix — see item 13 for the full list): human-hair-vs-synthetic as a first-class filterable field distinct from `material` (it's folded into the `materials` list rather than being its own boolean); bleached knots; pre-plucked; number-of-bundles-in-a-set; weft type as its own field (weft/no-weft is folded into the Bundle "product option" list rather than a dedicated attribute); brand (for Hair Essentials); pack/set size or weight for extensions and braiding hair; and a Hair-Essentials-specific sub-type breakdown finer than Hair Care/Tools/Accessories (no separate "Wig Care" / "Styling" / "Installation" buckets yet — Wig Care and Styling appear to be absent, Installation partially covered by `installationMethodChoices`).

## 5. Current Shopify metafield inventory

**Not verified from local code** for the authoritative list (Step 0, gap 1). What is verifiable is the **set of metafield names the app currently reads/writes by lookup**, listed in item 4 above, split into two mechanisms:
- Fixed `namespace: "hairgrab"` keys (5): `shipping_charge_type`, `loc_type`, `local_pickup_available`, `local_delivery_available`, `flat_rate_shipping`.
- Name-matched definitions of unknown namespace/key (9 logical fields): Hair Type/Material, Color, Texture, Density, Lace Size, Lace Type, Cap Type/Cap Size, Ships Within, Return Policy, Show on HairGrab Map.

To close this gap: someone with Shopify Admin access needs to export **Settings → Custom data → Products → Metafield definitions** (name, namespace, key, type, and "choices" validation for each), and confirm which are product-level vs variant-level.

## 6. Current collection and automated-rule inventory

**Not verified from local code.** The 7 circle links point at 7 collection handles (`wigs`, `bundles`, `clip-ins`, `tape-ins`, `closures`, `hair-essentials`, `all`) plus the discovery widget references `closures` and `hair-essentials` handles by name in its own case statement. Whether each is a manual or a smart/automated collection, and what conditions an automated one uses, requires Shopify Admin → Products → Collections access.

## 7. Current Shopify Search & Discovery configuration

**Not verified from local code** — this app's configuration is stored in Shopify, not in the theme repo, and there is no local export of it. What the theme code confirms is only the *rendering contract* Search & Discovery/Dawn expects: `snippets/facets.liquid` renders whatever `collection.filters` the platform returns (price-range, list, boolean presentations; swatch/text/image presentation styles) — it does not define which filters exist. **To fully answer this item, someone needs to open the Search & Discovery app in Shopify Admin and export its current filter configuration per collection.**

## 8. Current seller product-form field matrix

Built from `app/components/ProductBuilder.tsx` (the shared form component, 5,700+ lines) and the two routes that use it, `seller.add-product.tsx` / `seller.add-product.details.tsx` (create) and `seller.edit-product.$productId.tsx` (edit):

- **Already conditional per category**, exactly as your brief requires: the "product option" list, classification checkboxes, loc-type list, and lace/cap/density fields all key off the selected `ProductType`. Wigs get Lace Type/Lace Size/Cap Type/Density/Kosher/Medical; Bundles get Single/Deal/Weft options; Braiding Hair gets loc-type and Locs classification; Hair Essentials gets none of the hair-attribute fields.
- **Product-level fields:** title, description, productType, material, colors[], texture, searchClassifications[], installationMethods[], locType, density, laceSize, laceType, capSize, bundleWeight, shippingMethod, flatRateShipping, localPickupAvailable, localDeliveryAvailable, shipsWithin, returnPolicy, showOnMap, images.
- **Variant-level fields:** length, "option" (sub-style variant axis), color (when it varies per variant), price, salePrice (→ `compareAtPrice`), inventory, sku. Multi-length-per-product is handled through Shopify's native variant/option system (`selectedOptions`), reconciled via `product-edit-mutations.server.ts`'s `reconcileVariants`.
- **Fields collected but not obviously synchronized to a queryable metafield today:** `bundleWeight` was not found among the metafield-name lookups in the edit route — it appears to be collected in the form/payload type but its persistence path was not located in the staged edit-mutation code, so **this should be treated as an open question for Phase 2, not assumed either way.**
- Save flow always uses `metafieldsSet` against **live Shopify metafield definitions**, resolved by fuzzy name match (see item 5) — so if a definition's display name is renamed in Admin, the matching silently stops finding it (a real fragility worth flagging, distinct from Shopify config work itself).

## 9. Current CSV-import field matrix

There are **two unrelated CSV import features** in this codebase — this is important not to conflate:

1. **Review-CSV import** (`app/review-import.server.ts`, routes `seller.reviews.import.tsx` / `app.review-imports.tsx`): imports third-party review data (Judge.me export, Shopify Product Reviews, Loox, Yotpo, or generic CSV) with column-alias detection, per-row validation (rating range, required body, duplicate/fingerprint detection, date sanity), and a `judgeMeCsv()` export function that formats approved rows into a Judge.me-compatible import CSV. **This is unrelated to product catalog data** and is out of scope for this project except as a model of how HairGrab already does row-level CSV validation well (recognized headers, per-row status, no silent drops).
2. **Product-catalog CSV import**, which is *inside* the Add Product flow (`ProductBuilder.tsx`, function `handleCsvFile` / `parseCsvText` / `inferHairGrabDetails`, submitted via a hidden `csvBatchPayload` field to `seller.add-product.tsx`'s action, capped at 100 products per batch). This recognizes a Shopify-export-shaped CSV (Title/Handle/Variant SKU/Variant Price/Variant Inventory Qty/Image Src/Option columns) and groups rows into products by repeated handle.

**Critical finding, directly relevant to your "Structured Data Requirement":** the product-catalog CSV importer's `inferHairGrabDetails(title)` function derives `productType`, `productOption`, `texture`, `material`, and `laceSize` **from regex matching against the product title string** (e.g. `/wig/.test(text)`, `/body wave/.test(text)`, `/human hair|virgin|raw hair|remy/.test(text)`). This is exactly the anti-pattern your brief explicitly prohibits ("Do not build filters using... Product-title parsing... Fragile assumptions about product names"). It does partially self-correct: `csvMissingDetails()` flags a row as needing manual completion when required fields end up empty after inference, forcing the seller to fill them in before import — but **a wrong-but-non-empty guess (e.g., a Bundle whose title happens to contain "wig") passes through silently and is never re-confirmed with the seller.** Any future CSV design should add real structured columns for these fields and use title-inference only as a suggested default the seller must actively confirm, not as silent auto-fill.

There is currently **no bulk multi-product catalog importer separate from this in-form batch mechanism** — no dedicated `/seller/import` route or script under `scripts/` handles catalog products (the one script present, `scripts/reconcile-processing-fees.ts`, is unrelated financial reconciliation).

## 10. Current HairGrab Core → Shopify synchronization map

Synchronization is **one-directional per feature, not a continuous two-way sync**:

- **Core → Shopify (writes):** `seller.add-product.tsx` creates a new Shopify product + variants + metafields + tags via Admin GraphQL, then creates a `SellerProduct` row locally with the resulting `shopifyProductId`. `seller.edit-product.$productId.tsx` loads the live Shopify product + live metafield definitions, diffs variant/media changes (`product-builder-model.ts`), and pushes only the changed pieces via `product-edit-mutations.server.ts` (`reconcileVariants`, `reconcileMedia`) plus per-field `metafieldsSet` calls.
- **Shopify → Core (reconciliation, not attribute sync):** `shopify-product-sync.server.ts`'s `syncSellerProductsFromShopify()` scans Shopify products by `vendor:"<seller's shopifyVendor>"` and adopts/updates only `title`, `shopifyHandle`, `status`, `publishedToShopify` into `SellerProduct` — it does **not** pull texture/color/length/etc. back into HairGrab Core, consistent with item 4 (Core intentionally has no attribute columns).
- **Read path for shoppers (search page only):** `api.product-discovery.ts` reads `SellerProduct` rows to get the list of live `shopifyProductId`s + owning seller, then fetches full product data (title, productType, `custom` and `hairgrab` namespace metafields, variants) directly from Shopify via Admin GraphQL on every request, normalizes it in `product-discovery.server.ts`, and filters/sorts **in application memory** before returning JSON.

There is no webhook-driven near-real-time sync of product attribute changes back into Core, and no cached/indexed copy of product attributes anywhere — every discovery-API request re-fetches all active products from Shopify (see item 24 for the performance implication).

## 11. Required category-and-filter matrix (requested vs. currently supported)

| Category | Filters you requested | Currently backed by a real structured field? |
|---|---|---|
| Wigs | style/type, texture, length, color, lace type, lace size, cap size, installation (glueless/adhesive), density, human/synthetic, medical wig, kosher wig, price, seller, ships within, fulfillment flags, rating | style/type ✅ (`productOptions.WIG`), texture ✅, length ✅ (variant option), color ✅, lace type ✅, lace size ✅, cap size ✅ (`capSize`), installation ⚠️ partial (`installationMethodChoices` exists but is Crochet/Pre-Looped — braiding-style install, not glueless/adhesive; a wig-specific installation field was not found), density ✅, human/synthetic ⚠️ folded into `materials`, not a dedicated boolean, medical/kosher wig ✅ (tags), price/seller ✅ (native Shopify), ships within ✅ (metafield), fulfillment flags ✅ (`hairgrab` namespace booleans), rating ⚠️ see item 20 |
| Bundles | texture, length, color, individual/deal, # bundles, hair origin, weft type, price, seller, shipping/fulfillment, rating | texture/length/color ✅, individual/deal ✅ (`productOptions.BUNDLE`), # bundles ❌ not found, hair origin ⚠️ folded into `materials`, weft type ⚠️ folded into product option (Weft/No Weft) rather than its own field, rest ✅/⚠️ as above |
| Closures + Frontals | closure/frontal, lace size/type, texture, length, color, pre-plucked, bleached knots, hair origin, rest | closure/frontal ✅ (`productOptions.CLOSURE_FRONTAL`), lace size/type ✅, texture/length/color ✅, pre-plucked ❌ not found, bleached knots ❌ not found, hair origin ⚠️ folded into `materials` |
| Extensions | method (clip/tape/halo/ponytail/topper/sew-in/microlink/i-tip), texture, length, color, hair origin, human/synthetic, pieces/set size, weight, rest | method ⚠️ partial — Clip-In/Tape-In/I-Tip-Microlinks/Ponytail/Halo exist; **Topper and Sew-In are not in `productOptions.EXTENSION`**, pieces/set size ❌ not found, weight ❌ not found (only `bundleWeight`, scoped to Bundles) |
| Braids + Crochet | braiding/crochet/locs, protective-style type, texture, length, color, human/synthetic, pre-stretched, # packs, rest | braiding hair ✅ (top-level type), locs ✅ (classification tag + `locTypeChoices`), crochet ⚠️ only as a **legacy** tag (`"Crochet Hair"` in `LEGACY_CLASSIFICATION_TAGS`) — not a current, actively-assigned classification, pre-stretched ✅ (`installationMethodChoices`? actually a `productOptions.BRAIDING_HAIR` value), # packs ❌ not found |
| Hair Essentials | product type (care/wig-care/installation/styling/tools/accessories), brand, concern/use, rest | product type ⚠️ only Hair Care/Tools/Accessories exist (`productOptions.HAIR_ESSENTIAL`) — **Wig Care, Installation, and Styling sub-types are not present**, brand ❌ not found, concern/use ❌ not found |
| Shop All | category, product type, texture/length/color where applicable, rest | ✅ achievable once the per-category fields above exist, since "Shop All" is a view, not new data |
| All categories | ships within, nationwide shipping, local pickup, local delivery, same-day delivery, rating | ships within ✅, nationwide/local pickup/local delivery ✅ (all present as `hairgrab` metafields/Seller booleans), **same-day delivery as a per-product filterable flag was not found** — same-day exists extensively as an operational/fulfillment feature (`same-day-*.server.ts` files, `Seller.offersSameDayDelivery`), but no per-product "same-day eligible" metafield was located in the form/edit code reviewed |

## 12. Existing-data-to-canonical-data mapping

`app/product-categories.ts`'s `normalizeProductCategory()` already implements exactly this for the top-level category: it maps known-drifted raw values ("Wig", "WIG", "wigs ", etc.) to the 6 canonical labels, and returns `null` (not a guess) when it can't confidently match — which the staff-only `app.product-category-audit.tsx` route uses to classify every live product as OK / INCONSISTENT / UNRECOGNIZED. **This is precisely the tool your brief calls for in principle, already built, but scoped only to top-level category — it does not yet check texture/color/lace-type/etc. for drift**, and running it requires the Admin session Phase 1 doesn't have.

## 13. Missing-field list

Fields your brief requires that were **not found** anywhere in the reviewed code (form, edit route, discovery, or CSV importer):

- Human-hair-vs-synthetic as its own controlled boolean/enum (currently folded into the free-form `materials` list)
- Bleached knots (Closures/Frontals)
- Pre-plucked (Closures/Frontals)
- Number of bundles in a set (Bundles)
- Weft type as a standalone attribute (currently only Weft/No Weft as a Bundle "product option")
- Topper and Sew-In as Extension methods (only Clip-In/Tape-In/I-Tip-Microlinks/Ponytail/Halo exist)
- Pieces/set size and weight for Extensions
- Number of packs/set size for Braiding/Crochet
- Wig-specific installation type distinct from glueless (glueless itself is a `productOptions.WIG` value, not a separate "installation type" field; "adhesive" was not found at all)
- Wig Care, Installation, and Styling as Hair-Essentials sub-types (only Hair Care/Tools/Accessories)
- Brand (Hair Essentials)
- Hair concern / intended use (Hair Essentials)
- Per-product same-day-delivery eligibility flag (same-day exists at the seller/operations level, not confirmed at product level)
- A currently-active (non-legacy) Crochet Hair classification

## 14. Proposed canonical allowed values

Recommendation only, pending your approval — not applied:

- Adopt `app/product-categories.ts`'s 6 values as the base, relabeling only display text: `Closures & Frontals` → `Closures + Frontals`, `Braiding Hair` → `Braids + Crochet` (keep the enum values `CLOSURE_FRONTAL`/`BRAIDING_HAIR` unchanged to avoid a second migration of every existing tag/productType value — only the human-facing label changes). Add `Shop All` as a **view**, not a stored enum value (it must never be written to `productType`).
- Extend `productOptions.EXTENSION` with `TOPPER` and `SEW_IN`.
- Promote `Crochet Hair` from legacy to a real, currently-assignable classification alongside `Locs` under Braids + Crochet (or fold both into one "protective style type" enum, since your brief lists them as siblings, not tags-on-top-of-a-category).
- Add `Human Hair` / `Synthetic Hair` / `Blend` as a dedicated boolean-ish enum, separate from the existing free-text-flavored `materials` list, since it needs to be a first-class filter, not a side effect of the material label.
- Add `Wig Care`, `Installation`, `Styling` to `productOptions.HAIR_ESSENTIAL`.
- New enums needed with no existing precedent to build from: bleached knots (boolean), pre-plucked (boolean), number-of-bundles (small int/enum), weft type, pieces/set size, weight, number of packs, same-day-eligible (boolean), brand (likely free-text or a growing controlled list), hair concern/use.

## 15. Proposed Shopify metafield definitions

Cannot be finalized without item 5's export (to avoid creating a definition that collides with or duplicates an existing one under a different name). Structurally, the recommendation is to keep the existing pattern — human-readable metafield **definitions** with a `validations: choices` list, looked up by name — since it's already load-bearing throughout the edit route, rather than introducing a second, parallel mechanism.

## 16. Product-level vs. variant-level field recommendations

Consistent with current usage: category, all attribute/classification fields, shipping/fulfillment flags, and return policy stay **product-level**. Length, sub-style ("option"), per-variant color, price, and inventory stay **variant-level** (they already are). Newly requested fields like "number of bundles/packs/pieces" and "weight" are naturally product-level unless a seller genuinely sells different pack counts as separate purchasable variants, which is a product-design question for Phase 2, not an audit finding.

## 17. Existing-product backfill strategy

Recommended approach, pending approval:
1. Run the existing `app.product-category-audit.tsx` logic (already read-only, already exists) to get every live product's OK/INCONSISTENT/UNRECOGNIZED status for top-level category — this alone answers a large part of backfill scoping with zero new code.
2. Auto-map only what `normalizeProductCategory()`-style confident matching supports: top-level category from drifted `productType` strings, and the two already-tagged classifications (Kosher/Medical Wig) including their legacy tag spellings.
3. Do **not** auto-guess: human/synthetic, lace type/size, cap size, density, bleached knots, pre-plucked — these have no reliable existing signal to infer from (there's no historical field to normalize from; they've simply never been collected for older products).
4. Produce a manual-review exception list = every active product where a `productType`-normalization fails (`UNRECOGNIZED`) **or** any required field for its category is empty.
5. Never overwrite an existing non-empty value — this matches the pattern already used in `resolveChoiceValue`/`addExistingMetafield`, which skip writing when there's nothing new to say.

## 18. Products requiring manual review

Cannot be enumerated without running the audit query against live Shopify data (Step 0 gap). The mechanism to produce this list already exists in code (`app.product-category-audit.tsx`); it just hasn't been run in this phase.

## 19. Native Shopify capabilities vs. custom-code requirements

- **Native and already live:** collection-based browsing, Dawn's `facets.liquid`/`facets.js` rendering whatever Search & Discovery exposes, native price/compare-at rendering, native pagination.
- **Custom and already live, but only on the search page, not collections:** the entire `hg-discovery` widget (category buttons, free-text attribute filters, sort, results grid, "load more") — a bespoke client-side app talking to a bespoke API, not using Search & Discovery at all.
- **Custom and already live, bolted onto native collection pages:** the infinite-scroll `custom_liquid_bT9tVF` block in `collection.json`, which DOM-scrapes Dawn's native pagination links and appends product cards via `fetch` + `DOMParser` — this is a real, working mechanism, but it is fragile by construction (it depends on Dawn's exact pagination HTML shape) and is unrelated to filtering.
- **This is the key architectural decision Phase 2 needs from you, not something Phase 1 can resolve alone:** the two live filtering systems (native facets on collections vs. custom discovery widget on search) are inconsistent with each other today, and a category-first redesign will need to pick one to build on — likely native collections + Search & Discovery metafield filters, given collections are what your circles already link to and what Shopify natively supports for sorting/pagination/SEO, with the custom discovery widget's cross-cutting text search staying scoped to the search page it already owns. This is a recommendation, not a decision made on your behalf.

## 20. Rating-filter and rating-sort feasibility

This needs your explicit attention: **HairGrab Core has its own independent rating/review system** (`ProductReview`, `SellerReview`, `ReviewImport*` Prisma models, with `review-rating.server.ts`'s `ratingEligibility()` computing an average from `ProductReview` + approved `ReviewImportRow`s via a raw SQL query) that is **separate from Judge.me**, which is what shoppers actually see on the PDP per your brief. The `judgeMeCsv()` export function in `review-import.server.ts` suggests the intended relationship is: sellers submit imported reviews → HairGrab validates/dedupes/matches them to products → staff export a Judge.me-formatted CSV → someone manually imports that CSV into Judge.me. That means:
- HairGrab Core's own rating data may or may not reflect what's actually displayed in Judge.me on the storefront today — **not verified from local code**, and this is squarely a "confirm with whoever has Judge.me admin access" question, not a code question.
- If HairGrab's own `ProductReview`/`ReviewImportRow` data is confirmed to be a faithful reflection of shopper-visible ratings, rating **filter and sort become buildable without touching Judge.me at all** (the eligibility query already computes an average and a count per product; it would need to be exposed to the discovery/filter layer and, if collection-page filtering is chosen per item 19, surfaced as a metafield or precomputed index rather than a per-request raw query).
- If it is not a faithful reflection (e.g., only imported/legacy reviews are captured there and organic Judge.me reviews since launch are not), rating filtering will need either a Judge.me data export/sync (which is explicitly out of bounds without further authorization) or a decision to defer this filter.

## 21. Shipping-speed-sort feasibility

Currently unsupported, and not close to supported: sort options implemented in `product-discovery.server.ts` are only `relevance | newest | price_asc | price_desc`. There is no numeric "shipping speed" value on a product today — `shipsWithin` is a free-form/controlled-list metafield string (e.g., "24 hours"), not a sortable duration. Building this sort requires first turning `shipsWithin` into a value with a defined ordering (e.g., an explicit rank: Same-day < 24h < 48h < 72h) applied consistently, which is a real but modest addition, then adding a `sort=shipping_speed` branch to `discoverProducts()`'s comparator. This is buildable, but it is new work, not a native Shopify sort option — Shopify's own collection `sort_by` values do not include anything shipping-related, so if collection-page sorting is chosen over the custom discovery API (item 19), this sort would not be available there without custom code regardless.

## 22. URL and navigation

Only the search-page discovery widget has any URL-state logic to evaluate (native collection facets already handle this natively via Dawn/Shopify, which is well-proven). Findings on the custom widget:
- It **does** write filters into the URL query string on every change (`syncUrl()`), so filtered URLs are shareable and refresh-safe in the sense that reloading the same URL re-applies the same params.
- It uses **`history.replaceState`, not `pushState`**, for every filter/sort/search/page change. This means the browser Back button will **not** step back through filter changes one at a time — it will jump straight past all of them to whatever page the shopper was on before landing on search. This is a concrete gap against your "Browser Back and Forward navigation... preserved" requirement and would need `pushState` (with care to avoid spamming history on every keystroke) if this widget is the one carried forward.
- "Shop All clearing the category restriction" and "valid category destinations without 404s" are structurally fine on the **native collection** side (collections either exist or they don't — that's a content question, not code), but not verified for the specific 7 revised handles you're proposing, since creating/renaming collections is Admin work.

## 23. Desktop/mobile UX recommendation

Not decided here — this is a Phase 2 design deliverable. What Phase 1 can say: the existing `hg-discovery` widget already has the right *shape* (search/filter-toggle/sort controls, a chip row, a status/count region, a "load more" button) but implements the filter panel as a flat set of free-text inputs and a single-select category nav, not the collapsible, multi-select, checkbox-driven, category-aware panel your brief describes — and it isn't wired to collection pages at all today (item 19). Native Dawn `facets.liquid` already supports collapsible groups, multi-select list/swatch/price-range presentations, and a drawer/vertical/horizontal layout choice via section settings — which is a stronger starting point structurally for the desktop-sidebar-with-visible-results and mobile-drawer requirements, if collections are the chosen foundation.

## 24. Performance and accessibility risks

- **Performance (real, not hypothetical):** `api.product-discovery.ts` fetches **every active HairGrab product's full data from Shopify Admin GraphQL on every single request** (paginated in batches of 100 via `nodes(ids:...)`), then filters/sorts/paginates entirely in server memory, with only a 30-second edge cache (`Cache-Control: public, max-age=30`). As the catalog grows past low thousands of products, this will get slower and will consume Admin API rate-limit budget on every uncached search. This is the single most important scalability risk to flag before extending this pattern to collection pages.
- **Accessibility:** the category circles have alt text and are real anchors (good baseline). No explicit `:focus-visible` styling was found for them — should be visually confirmed, not assumed. The discovery widget's filter panel uses plain `<label>`/`<input>` pairs (reasonable), but the "Load more" pattern and the ARIA-live status region (`aria-live="polite"`) are present and correctly used for announcing result changes — a good existing pattern to keep. The separate infinite-scroll block on collection pages has no `aria-live` announcement of newly-loaded products at all, which is worth flagging as an existing gap independent of this project.
- A stray encoding artifact (`Loading products�` and chip `�` separators, likely a mis-encoded ellipsis/bullet) was noticed in `assets/hairgrab-discovery.js` — cosmetic, not a filtering concern, noted only because it's visible to real shoppers today.

## 25–27. Proposed file manifest / Prisma manifest / Shopify configuration changes

Deliberately **not produced in Phase 1.** Your instructions are explicit that Phase 1 stops at audit and gap-identification, and that implementation planning (including exact file/schema/Shopify-config manifests) should follow your approval of this audit and the canonical-vocabulary decisions in items 14–16. Producing a file manifest now would mean committing to an architecture (e.g., "extend the discovery widget" vs. "build on native collections") before you've had the chance to weigh in on item 19's open decision.

## 28. Testing plan (preliminary observation only)

The codebase already has an established colocated `*.server.test.ts` pattern (e.g., `product-builder-model.test.ts`, `product-discovery.server.test.ts`, `product-edit-mutations.server.test.ts`, `review-import.server.test.ts`) covering the exact modules this project would touch — a good sign that pure-logic changes (category normalization, discovery filtering, CSV validation) have a natural place to add tests. One gap: **no `test` script exists in `package.json`**, so the actual test runner/command in current use was not identified from local files alone; confirming how these tests are run today (locally and/or in CI) is a small open item for whoever owns the build pipeline, not a blocker.

## 29. Rollback plan (preliminary observation only)

Structurally favorable: category/attribute data lives in Shopify metafields/tags/productType, which are all individually reversible (a bad metafield write can be corrected by another `metafieldsSet` call; a bad tag can be removed) without any database migration risk on the HairGrab Core side, since Core itself stores none of these values. The main rollback risk is theme-side: replacing the two current filtering systems (native facets-on-collections and the search-only discovery widget) with one unified system means the old templates/sections should be preserved (renamed, not deleted) until the new system is verified, per your guardrails already forbidding deletion.

## 30. Recommended implementation phases (preliminary, non-binding)

1. Close the Step 0 access gaps (export live metafield definitions, collection list/rules, Search & Discovery config, and confirm the Judge.me/ProductReview relationship).
2. Decide the item 19 architecture question (native collections+facets vs. extending the custom discovery widget) and approve the canonical vocabulary in items 14–16.
3. Only then produce the detailed file/schema/config manifest and backfill/testing/rollback plans this audit deliberately deferred.

---

## Legacy/scratch files noticed at the `hair-grab-core` repo root (informational only, not audited as source)

The repo root contains a number of files that are **not** part of the running application and were not treated as authoritative source: `schema.prisma.txt`, `current-database-schema.txt` (empty), `schema-diff.txt`, `product-builder-changes.txt`, `seller-add-current.tsx`, `seller-edit-current.tsx`, `seller-store-REAL.txt`, `seller.store-preview.CLEAN-PUBLIC-INFO.tsx` (empty), `seller-add-product-recovery.patch`, `build-error.txt`, `build-hours-error.txt`, `build-settings-error.txt`, `buildlog.txt`, `build-check.txt`, `phase3-status.txt`, `phase3-tracked-diff.txt`, `package.json.backup`, `notepad`, `clear-cbs-login.cjs`, and a stray file literally named `const SHOPIFY_STORE_DOMAIN =.txt`. These look like debug snapshots/notes from prior work sessions. Worth a cleanup pass at some point so a future contributor doesn't mistake `seller-add-current.tsx` for the live `app/routes/seller.add-product.tsx` — but no action was taken on them here.

Also noted, not opened: `.env` (secrets), `prisma/dev.sqlite` (a local database file — not queried, per your access boundaries).

---

## END-OF-PHASE CONFIRMATION

- No files were modified, created, deleted, or renamed on either connected folder.
- No database was queried or connected to (Prisma schema/migration **files** were read as text only; `dev.sqlite` was not opened).
- No Shopify Admin session, Search & Discovery config, live collection/metafield data, or Judge.me API was accessed.
- Nothing was staged for commit, committed, pushed, uploaded, synced, or deployed. (Files were copied read-only into this session's own workspace purely so they could be searched/read — no write went back to either repo.)

**Continuation checklist for the next session, if this audit needs to pick up further:**
- [ ] Export live Shopify metafield definitions (names, namespaces, keys, choice lists, product/variant scope)
- [ ] Export live collection list + automated-collection rules
- [ ] Export current Search & Discovery filter configuration
- [ ] Confirm relationship between Judge.me's live review data and HairGrab Core's `ProductReview`/`ReviewImportRow` tables
- [ ] Confirm where `bundleWeight` is (or isn't) persisted
- [ ] Confirm whether `templates/index.json` (true homepage) is expected to get its own circles instance or whether `/collections/all` already serves as "home" in practice
- [ ] Run `app.product-category-audit.tsx` (already-built, read-only) against live data once Admin access is authorized, to get the actual OK/INCONSISTENT/UNRECOGNIZED counts for item 18

**Waiting for your review and explicit approval before any Phase 2 planning or implementation begins.**
