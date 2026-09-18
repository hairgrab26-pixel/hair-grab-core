# HairGrab Phase 1B — Read-Only Access-Gap Checklist

Scope confirmed: nothing was modified, no production data was connected to, no Shopify configuration was changed, no server was started, and nothing was implemented. Item 5 below was answered entirely from the two local folders already staged in this session (no new device access was needed). Items 1–4, and parts of 6–10, still need information or decisions **from you** — each is marked.

Architecture decisions from your approval are treated as fixed for everything below: native collections + Search & Discovery as the primary system; discovery widget stays search-only; Shop All is a view; `CLOSURE_FRONTAL`/`BRAIDING_HAIR` enum identifiers preserved with new labels "Closures + Frontals"/"Braids + Crochet"; Material field reused for human/synthetic/blend (no duplicate field); rating and shipping-speed sort deferred; Ships Within stays a launch filter.

---

## 1. Exporting live Shopify product metafield definitions — **needs you to run this**

**Option A — Admin UI (no developer tools needed):**
1. Go to **Shopify Admin → Settings → Custom data → Products.**
2. Click into each listed definition. For each one, record: **Name**, the **Namespace and key** pair (shown in its own labeled field on the definition's detail screen), **Content type** (its "Type"), and, if the type supports it, the **Choices** list under validations (only single/multi-line text and a few other types offer this).
3. Repeat for **Settings → Custom data → Product variants** if any variant-level metafields exist (your brief's per-variant fields — mainly length — are handled as native Shopify options, not metafields, so this list may be short or empty; confirm either way).
4. Save the result as a simple spreadsheet: one row per definition, columns Name / Namespace / Key / Type / Choices / Applies to (Product or Variant).

**Option B — faster, via Shopify's own GraphiQL app (still no code, no HairGrab Core involvement):**
1. Install Shopify's free **"GraphiQL App"** (or **Shopify GraphiQL Explorer**) from the Shopify App Store on the store, or use the GraphiQL Explorer already built into Shopify's developer tools if your Partner/Admin access includes it.
2. Run this query (read-only, no side effects):
   ```graphql
   query {
     metafieldDefinitions(first: 100, ownerType: PRODUCT) {
       nodes { name namespace key type { name } validations { name value } }
     }
   }
   ```
3. Repeat with `ownerType: PRODUCTVARIANT`.
4. Export the JSON response (or paste it) and send it back — that's the exact shape items 5, 8, and 15 of the original audit need.

**Why this can't be done from here:** these definitions live in the Shopify database, not in either repo; the code only knows the human-readable *names* it searches for (see the original audit, item 5), not the actual namespace/key/choices, by design.

## 2. Exporting the live collection list and automated-collection rules — **needs you to run this**

**Option A — Admin UI:**
1. Go to **Shopify Admin → Products → Collections.**
2. For each collection: record **Title**, **Handle** (visible in the "Search engine listing" section of the collection's edit page, or in the collection's storefront URL), **Type** (Manual vs. Automated — shown near the top of the page), and if Automated, the exact text under **Conditions** ("Products must match **all/any** of the following conditions: ...").
3. Pay special attention to the 7 handles the theme already links to: `wigs`, `bundles`, `clip-ins`, `tape-ins`, `closures`, `hair-essentials`, `all` — confirm each one's current type and rules.

**Option B — via GraphiQL app (same tool as item 1):**
```graphql
query {
  collections(first: 250) {
    nodes {
      id title handle sortOrder
      ruleSet { appliedDisjunctively rules { column relation condition } }
    }
  }
}
```
Export the result the same way.

## 3. Documenting the current Search & Discovery filter configuration — **needs you to run this**

Search & Discovery is a first-party Shopify app with its own admin screens; it does not currently expose its filter configuration through the standard Admin GraphQL API, so there is no query equivalent to items 1–2 — this one has to be read and transcribed by hand:
1. Go to **Shopify Admin → Apps → Search & Discovery** (if it's not pinned in the sidebar, it's under the full Apps list).
2. Open the **Filters** tab. Shopify lets filter configuration be either store-wide or scoped per-collection — check whether HairGrab's setup is store-wide or has per-collection overrides for `wigs`, `bundles`, `closures`, `hair-essentials`, and any other live collections.
3. For each scope, record the **exact list of enabled filters in their displayed order** (e.g., Availability, Price, Vendor, Product type, and any metafield-backed filters that were enabled from the definitions in item 1) plus whether each is shown as a list, a range (price), or swatches.
4. There is usually no built-in export button for this screen — a written list or a few screenshots is the practical way to capture it. Send that back as-is; it doesn't need to be reformatted.
5. Optional but useful for later: note whether the **Search** tab (synonyms/boosts) has anything configured — not required for filtering, just good context.

## 4. Running the existing read-only product-category audit route — **needs someone with staff access to run it; here's exactly how**

The route is `app/routes/app.product-category-audit.tsx` in HairGrab Core. It was re-confirmed in this pass to be genuinely read-only: its `loader` only runs a Shopify Admin GraphQL **query** (`products(... query: "tag:HairGrab")`, no mutation) and a Prisma **read** (`db.sellerProduct.findMany`) — there is no `action` export in the file at all, so there is no write path to trigger even by accident.

1. Whoever normally has staff/admin access to HairGrab Core should open it the same way they open any other staff screen — through the embedded app inside **Shopify Admin → Apps → HairGrab Core**, then navigate to the Product Category Audit page (it isn't linked from the main nav in the code reviewed, so it may need to be reached by appending `/app/product-category-audit` to the app's embedded admin URL).
2. Let it load. It will show four summary tiles — **Total products, Already canonical, Inconsistent (needs re-save), Unrecognized productType** — and, if any are flagged, a table of Product / Seller / Current productType / Canonical category / Outcome / Shopify status.
3. **Record only these results** (copy the numbers and, if the flagged table is non-empty, copy or screenshot the table). Do not click anything else on the page, and do not act on any row yet — no re-saves, no manual edits — that's Phase 2/3 work once the backfill approach is approved.
4. Send back the summary tile numbers and the flagged table (or "zero flagged" if that's the result).

## 5. Code trace: is `bundleWeight` persisted, and where?

**Answer: no — it is collected in the UI but never reaches Shopify.** Traced fully within the already-staged local files, no new access needed:

- `bundleWeight` is declared as a `ProductPayload` field (`app/components/ProductBuilder.tsx` line 56, and again in `app/routes/seller.add-product.tsx` line 74).
- It has real UI: a `useState` in `app/routes/seller.add-product.details.tsx` (line 330) with a `<select>` defaulting to `"100g"`, shown only when `showBundleWeight = isBundles` (line 414) — so it's correctly scoped to the Bundles category already.
- It's threaded through `ProductBuilder.tsx`'s state/props (lines 918, 1066–1067, 1964, 5181, 5191) and even defaulted for CSV-imported items (`bundleWeight: item.bundleWeight || "100g"`, line 2586) and referenced again at line 2761 in what builds the outgoing payload object.
- **But in `seller.add-product.tsx` — the file that actually turns a payload into Shopify metafields at product creation — `bundleWeight` never appears again after its type declaration on line 74.** A full grep of that file for `weight`/`Weight` returns exactly one hit, that same type line. The metafield-push block that *does* run at creation (confirmed around lines 2500–2555) explicitly pushes `installation_methods` and a `hairgrab.loc_type` metafield, but never `bundleWeight`. It is silently dropped between the client payload and the Shopify write — not stored anywhere, not even as a value that gets rejected and logged.

**One related correction to the original audit's "missing field" list (item 13):** a *similar* field, `pieceCount` (for `CLIP_IN` extensions), also exists as UI state in `seller.add-product.details.tsx` (lines 333, 417–419 `showPieceCount`, 1186–1202) — but unlike `bundleWeight`, it does **not** appear anywhere in `ProductBuilder.tsx` or `seller.add-product.tsx` at all. It looks even less wired up than `bundleWeight`: there's a form control for it, but no evidence it ever becomes part of the submitted payload. So "pieces/set size" isn't quite "not found" as the original audit said — it's "half-built in the UI, then apparently abandoned before reaching the payload." Worth deciding in Phase 2 whether to finish wiring it up (cheaper) or design it fresh.

## 6. Homepage circles vs. collection-page-only circles

**Recommendation, pending your call — not applied:** add the `hairgrab-shop-categories` section to `templates/index.json` (the true homepage), where it is currently absent. This is the more important gap of the two, since a shopper landing on the homepage today gets no category-first entry point at all.

Whether to *also* keep it at the top of every collection page (its current placement) is a smaller, genuinely open UX question: keeping it there lets a shopper viewing Wigs jump sideways into Bundles without going home first, but it also means a shopper who is already inside "Wigs" sees a circle for "Wigs" again, which reads as slightly redundant. A reasonable middle ground — worth your sign-off before Phase 2, not decided here — is to keep the circles on `Shop All`/the all-products collection (where "browse everything" is exactly the moment they're useful) and consider suppressing them on the other six single-category collection pages, where the shopper has already made that choice. This does not require removing the component, only whether `collection.json` (used by every collection) keeps rendering it or whether a category-specific template variant is introduced.

## 7. Revised MVP filter matrix

| Category | Launch-required | Later | Unsupported / deferred |
|---|---|---|---|
| **Wigs** | style/type, texture, length, color, lace type, lace size, cap size, density, Material (Human Hair / Synthetic Hair / Blend — reusing the existing field, no new one), Kosher Wig, Medical Wig, price, seller, Ships Within, nationwide/local pickup/local delivery flags | glueless-vs-adhesive as its own installation-type field (today's `installationMethodChoices` is Crochet/Pre-Looped, which doesn't fit Wigs at all — needs a real wig-specific value set) | rating filter/sort, shipping-speed sort, same-day-delivery as a per-product flag (not confirmed to exist) |
| **Bundles** | texture, length, color, individual-vs-deal, Material, price, seller, Ships Within, fulfillment flags | number of bundles in a set, weft type as its own field (currently folded into the "product option" list) | rating, shipping-speed sort |
| **Closures + Frontals** | closure-vs-frontal, lace size, lace type, texture, length, color, Material, price, seller, Ships Within, fulfillment flags | pre-plucked, bleached knots (both need new fields — no existing signal to reuse) | rating, shipping-speed sort |
| **Extensions** | method (Clip-In/Tape-In/I-Tip-Microlinks/Ponytail/Halo — Topper and Sew-In need to be added to the enum), texture, length, color, Material, price, seller, Ships Within, fulfillment flags | pieces/set size (half-built per item 5 — cheaper to finish than build fresh), weight | rating, shipping-speed sort |
| **Braids + Crochet** | protective-style type (Locs + promoting Crochet Hair out of legacy status, per your approved direction), texture/style, length, color, Material, price, seller, Ships Within, fulfillment flags | pre-stretched as its own filter (currently a Braiding-Hair "product option" value, reusable as-is if that's acceptable), number of packs/set size | rating, shipping-speed sort |
| **Hair Essentials** | product type (today only Hair Care/Tools/Accessories — Wig Care, Installation, Styling need adding), price, seller, Ships Within, fulfillment flags | brand, hair concern/intended use (both need new fields) | rating, shipping-speed sort |
| **Shop All** | category, product type, texture/length/color where applicable, price, seller, Ships Within, fulfillment flags, rating (see below) | — | shipping-speed sort |
| **All categories** | Ships Within (confirmed in scope per your note) | — | rating filter/sort **and** shipping-speed sort are both explicitly deferred per your instruction — listed here for completeness, not as launch work |

## 8. Proposed metafield list (reusing existing definitions wherever possible)

**Reuse as-is** (already matched by name in `seller.edit-product.$productId.tsx`, pending item 1's confirmation of their real namespace/key/choices): Hair Type/Material, Color, Texture, Density, Lace Size, Lace Type, Cap Type/Cap Size, Ships Within, Return Policy, Show on HairGrab Map, plus the fixed `hairgrab` namespace keys (`shipping_charge_type`, `loc_type`, `local_pickup_available`, `local_delivery_available`, `flat_rate_shipping`).

**Genuinely new, needed only for the launch-required matrix above:**
- Extension method additions: extend the existing product-option enum with `TOPPER`, `SEW_IN` (no new metafield — this is a code-side enum change, since method is currently stored via `productOptions`/tags-equivalent, to be confirmed once item 1's export is in hand)
- A real Wig installation-type value set, separate from the existing Crochet/Pre-Looped list
- Hair-Essentials product-type additions: `WIG_CARE`, `INSTALLATION`, `STYLING`
- Promote "Crochet Hair" out of `LEGACY_CLASSIFICATION_TAGS` into the live classification set for Braids + Crochet

**New fields deferred to "Later" per item 7** (bleached knots, pre-plucked, number of bundles/packs/pieces, weft type as its own field, brand, hair concern/use) are intentionally **not** proposed for definition yet, since they're not launch-required — defining them now would be getting ahead of your approval.

No duplicate Material/human-synthetic field is proposed, per your explicit instruction to reuse the existing controlled Material list.

## 9. Proposed collection/handle map (six categories + Shop All)

| Revised category | Proposed handle | Status |
|---|---|---|
| Wigs | `wigs` | **Exists today** — keep as-is |
| Bundles | `bundles` | **Exists today** — keep as-is |
| Closures + Frontals | `closures` | **Exists today**, needs title/label updated to "Closures + Frontals"; confirm in item 2's export whether Frontals are already included in its rules |
| Extensions | `extensions` (new) | **Does not exist today** — the current `clip-ins` and `tape-ins` collections would need to be superseded by it |
| Braids + Crochet | `braids-crochet` (new) | **Does not exist today** |
| Hair Essentials | `hair-essentials` | **Exists today** — keep as-is |
| Shop All | `all` | **Exists today** — kept as a view, never a stored category, per your instruction |

**Open item for you, not decided here:** the existing `clip-ins` and `tape-ins` collections are live today (they're two of the current seven circles). Moving to the new `extensions` collection means deciding whether to keep `clip-ins`/`tape-ins` as legacy collections with **Shopify Admin → Settings → Navigation → URL redirects** pointed at `/collections/extensions` (recommended, avoids the 404s your original brief calls out), or something else. This is a content/Admin decision, not a code change, and nothing has been created or redirected here.

## 10. Proposed implementation plan and file manifest — **planning only, no edits made**

**Phase 2A — HairGrab Core (canonical vocabulary + form):**
- `app/product-categories.ts` — update the two display labels only (`Closures & Frontals` → `Closures + Frontals`, `Braiding Hair` → `Braids + Crochet`); enum values stay unchanged, per your instruction.
- `app/components/ProductBuilder.tsx` — extend `productOptions.EXTENSION` with `TOPPER`/`SEW_IN`; extend `productOptions.HAIR_ESSENTIAL` with `WIG_CARE`/`INSTALLATION`/`STYLING`; add a real Wig installation-type choice list; finish or remove the half-built `pieceCount` control (item 5); decide `bundleWeight`'s fate (finish wiring it to a metafield, or remove the dead control) — same file, same decision point.
- `app/routes/seller.add-product.tsx` and `app/routes/seller.edit-product.$productId.tsx` — add metafield pushes for whichever new fields are approved after item 1's export confirms real definition names/keys.
- `app/routes/seller.edit-product.$productId.tsx` — promote `"Crochet Hair"` from `LEGACY_CLASSIFICATION_TAGS` to `CLASSIFICATION_TAGS` under Braids + Crochet.
- `app/routes/app.product-category-audit.tsx` — no code change expected; it's the tool used in item 4.

**Phase 2B — Theme (category circles + native filtering):**
- `sections/hairgrab-shop-categories.liquid` — update to the 6 revised circles + Shop All (labels and `href`s), pending item 9's collection/redirect decisions.
- `templates/index.json` — add the circles section to the homepage, pending item 6's approval.
- `templates/collection.json` — no structural change expected if native facets stay the filtering system; revisit only if item 6 decides to suppress circles on single-category collections.
- Search & Discovery filter enablement itself is **Shopify Admin configuration, not a theme file** — tracked under item 3, not this manifest.

**Explicitly not touched by this plan:** `snippets/hairgrab-discovery.liquid`, `assets/hairgrab-discovery.js/.css`, and `sections/main-search.liquid` (search stays on the custom widget, unchanged, per your instruction); `config/settings_data.json`; anything under Judge.me/reviews; pricing, checkout, payments, commissions, payouts, shipping-rate logic, or seller approvals.

**No edits, migrations, or configuration changes have been made.** This manifest becomes actionable once items 1–4's exports are in hand and items 6–9's open decisions are confirmed.

---

## Summary: what's still needed from you before an implementation manifest can be finalized

- [ ] Metafield definitions export (item 1)
- [ ] Collection list + rules export (item 2)
- [ ] Search & Discovery filter configuration write-up (item 3)
- [ ] Product-category-audit results (item 4)
- [ ] Decision: finish or drop `bundleWeight` and `pieceCount` (item 5)
- [ ] Decision: homepage circles yes/no, and whether to suppress circles on single-category collection pages (item 6)
- [ ] Sign-off on the launch/later/deferred split in item 7
- [ ] Decision: `clip-ins`/`tape-ins` → redirect to `extensions`, or something else (item 9)

Everything else above (the trace in item 5, and the recommendations in items 6–10) is complete from local code and does not need further access.
