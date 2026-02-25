/**
 * STYRKR Variant Map
 * ------------------
 * Fill in the Shopify IDs for each pack SKU before deploying.
 *
 * HOW TO GET THESE IDs
 * ─────────────────────
 * Option A — Shopify Admin API (fastest):
 *   GET /admin/api/2024-01/products.json?handle=<product-handle>
 *   GET /admin/api/2024-01/collections.json?handle=<collection-handle>
 *   → variants[].id, id (product), collection.id
 *
 * Option B — Storefront API:
 *   query { product(handle: "...") { id variants(first:20){ id title } } }
 *
 * Option C — Browser console on the product page:
 *   fetch('/products/<handle>.js').then(r=>r.json()).then(console.log)
 *
 * BUNDLE PRODUCT IDs
 * ─────────────────────
 * BYOB_PRODUCT_ID   → Shopify Product ID of the "Build Your Own Bundle" product
 * BYOB_VARIANT_ID   → The single variant ID of that bundle product
 * BYOB_SELLING_PLAN → The Recharge selling plan ID for subscribe & save
 *                     (find in Recharge merchant portal > Subscriptions > Selling plans,
 *                      or GET /admin/api/2024-01/selling_plan_groups.json)
 *
 * PACK ENTRIES
 * ─────────────────────
 * Each entry in PACK_VARIANT_MAP maps a packKey (from data.js) to:
 *   - variantId      : Shopify Variant ID of that pack/product
 *   - productId      : Shopify Product ID
 *   - collectionId   : Shopify Collection ID the product lives in
 *                      (Recharge uses this to validate bundle selections)
 *
 * NOTES
 * ─────────────────────
 * - All IDs must be plain integers or numeric strings (no "gid://" prefixes).
 * - If a SKU has multiple pack sizes (e.g. MIX60_6 vs MIX60_12), each gets its
 *   own entry because they map to different variants of the same product.
 * - GEL50_12 and BAR30_12 only have one pack size so they only have one entry.
 */

window.STYRKR_VARIANT_MAP = {

  // ── Bundle product (the BYOB parent) ─────────────────────────────────────
  BYOB_PRODUCT_ID:   'FILL_ME_IN',  // e.g. '7134322196677'
  BYOB_VARIANT_ID:   'FILL_ME_IN',  // e.g. '41291293425861'
  BYOB_SELLING_PLAN: 'FILL_ME_IN',  // e.g. '743178437'  (subscribe & save plan)

  // ── Pack → Shopify IDs ────────────────────────────────────────────────────
  // fetch('/products/build-your-own-bundle.js').then(r=>r.json()).then(d=>console.log(d.variants))
  // to cross-check variant titles against pack_option values in data.js.

  packs: {
    // Energy Drink Powders (BYOB collection: byob-energy-drink-powders)
    MIX60_6:          { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    MIX60_12:         { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    MIX90_6:          { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    MIX90_12:         { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    MIX90_CAFF_6:     { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    MIX90_CAFF_12:    { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },

    // MIX+ tubs (individual product pages, not a collection)
    MIXPLUS_15:       { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    MIXPLUS_25:       { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },

    // Gels
    GEL30_6:          { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    GEL30_12:         { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    GEL30_CAFF_6:     { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    GEL30_CAFF_12:    { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    GEL50_12:         { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },

    // Bars
    BAR30_12:         { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    BAR50_6:          { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    BAR50_12:         { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },

    // Electrolyte tablets (SLT07 500mg)
    SLT07_500_T12:    { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    SLT07_500_B3:     { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    SLT07_500_B6:     { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },

    // Electrolyte tablets (SLT07 1000mg)
    SLT07_1000_T12:   { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    SLT07_1000_B3:    { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
    SLT07_1000_B6:    { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },

    // SLT+ sachets
    SLTPLUS_30:       { variantId: 'FILL_ME_IN', productId: 'FILL_ME_IN', collectionId: 'FILL_ME_IN' },
  },
};
