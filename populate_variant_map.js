#!/usr/bin/env node
/**
 * STYRKR — Auto-populate variant_map.js
 * ──────────────────────────────────────
 * Uses the Shopify Admin API to resolve product/variant/collection IDs
 * for every pack in data.js and writes them into variant_map.js.
 *
 * Run once per catalogue change (or whenever you add new packs).
 *
 * Prerequisites:
 *   npm install node-fetch  (or run with Node 18+ which has native fetch)
 *
 * Usage:
 *   SHOPIFY_STORE=styrkr.myshopify.com \
 *   SHOPIFY_TOKEN=shpat_xxxxxxxxxxxx \
 *   node populate_variant_map.js
 *
 * The script will:
 *   1. Fetch each product by handle from the Admin API
 *   2. Fetch each BYOB collection to get its collection ID
 *   3. Fetch the build-your-own-bundle product for BYOB IDs
 *   4. Fetch selling plan groups for the subscription plan
 *   5. Write assets/variant_map.js with all IDs filled in
 *
 * IMPORTANT: Variant matching uses pack_option text from data.js
 * (e.g. "6 pack", "12 pack", "Tube of 12") matched against
 * variant.title in the Shopify product. Review the output and fix
 * any mismatches manually.
 */

const STORE = process.env.SHOPIFY_STORE;  // e.g. 'styrkr.myshopify.com'
const TOKEN = process.env.SHOPIFY_TOKEN;  // Admin API token (shpat_...)

if (!STORE || !TOKEN) {
  console.error('Set SHOPIFY_STORE and SHOPIFY_TOKEN environment variables.');
  process.exit(1);
}

const API_VERSION = '2024-01';
const BASE = `https://${STORE}/admin/api/${API_VERSION}`;
const HEADERS = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };

async function shopifyGet(path) {
  const res = await fetch(BASE + path, { headers: HEADERS });
  if (!res.ok) throw new Error(`Shopify API error ${res.status} on ${path}`);
  return res.json();
}

// ── Pack definitions from data.js (hardcoded here to avoid require()) ──────
// Each entry: [packKey, productHandle, packOption, collectionHandle]
// collectionHandle is null for direct product URLs.
const PACK_DEFS = [
  // Energy drink powders — in a collection
  ['MIX60_6',        'mix60-dual-carb-drink',               '6 pack',                'byob-energy-drink-powders'],
  ['MIX60_12',       'mix60-dual-carb-drink',               '12 pack',               'byob-energy-drink-powders'],
  ['MIX90_6',        'mix90-dual-carb-drink',               '6 pack',                'byob-energy-drink-powders'],
  ['MIX90_12',       'mix90-dual-carb-drink',               '12 pack',               'byob-energy-drink-powders'],
  ['MIX90_CAFF_6',   'mix90-caffeine-dual-carb-drink',      '6 pack',                'byob-energy-drink-powders'],
  ['MIX90_CAFF_12',  'mix90-caffeine-dual-carb-drink',      '12 pack',               'byob-energy-drink-powders'],

  // MIX+ tubs — direct product page
  ['MIXPLUS_15',     'byob-mix-pink-grapefruit-dual-carb-electrolyte-mix', '556g tub', null],
  ['MIXPLUS_25',     'byob-mix-pink-grapefruit-dual-carb-electrolyte-mix', '926g tub', null],

  // Gels
  ['GEL30_6',        'vq-byob-gel30-dual-carb-energy-gel-1x-copy',        '6 pack',   null],
  ['GEL30_12',       'vq-byob-gel30-dual-carb-energy-gel-1x-copy',        '12 pack',  null],
  ['GEL30_CAFF_6',   'vq-byob-gel30-caffeine-energy-gel-1x-copy',         '6 pack',   null],
  ['GEL30_CAFF_12',  'vq-byob-gel30-caffeine-energy-gel-1x-copy',         '12 pack',  null],
  ['GEL50_12',       'gel50-dual-carb-energy-gel-citrus-fruits-copy',      '12 pack',  null],

  // Bars
  ['BAR30_12',       'bar30-high-carb-rice-energy-bar',                    '12 pack',  null],
  ['BAR50_6',        'bar50-variety-pack-energy-bars',                     '6 pack',   'byob-high-carb-bars'],
  ['BAR50_12',       'bar50-variety-pack-energy-bars',                     '12 pack',  'byob-high-carb-bars'],

  // SLT07 500mg
  ['SLT07_500_T12',  'slt07-hydration-tablets-mild-berry-500mg',           'Tube of 12',        null],
  ['SLT07_500_B3',   'slt07-hydration-tablets-mild-berry-500mg',           'Box of 3',          null],
  ['SLT07_500_B6',   'slt07-hydration-tablets-mild-berry-500mg',           'Box of 6',          null],

  // SLT07 1000mg
  ['SLT07_1000_T12', 'slt07-hydration-tablets-mild-citrus',                'Tube of 12',        null],
  ['SLT07_1000_B3',  'slt07-hydration-tablets-mild-citrus',                'Box of 3',          null],
  ['SLT07_1000_B6',  'slt07-hydration-tablets-mild-citrus',                'Box of 6',          null],

  // SLT+
  ['SLTPLUS_30',     'slt-plus',                                           'Box (30 servings)', null],
];

async function run() {
  console.log('Fetching Shopify data from', STORE, '…\n');

  // ── 1. Fetch the BYOB bundle product ──
  console.log('→ Fetching build-your-own-bundle product…');
  const byobData = await shopifyGet('/products.json?handle=build-your-own-bundle');
  const byobProduct = byobData.products?.[0];
  if (!byobProduct) {
    console.error('Could not find product with handle build-your-own-bundle');
    process.exit(1);
  }
  const BYOB_PRODUCT_ID = String(byobProduct.id);
  const BYOB_VARIANT_ID  = String(byobProduct.variants?.[0]?.id || '');
  console.log('   BYOB product ID:', BYOB_PRODUCT_ID, '  variant ID:', BYOB_VARIANT_ID);

  // ── 2. Fetch selling plan groups (for subscribe & save) ──
  console.log('→ Fetching selling plan groups…');
  const spgData = await shopifyGet('/selling_plan_groups.json?limit=250');
  let BYOB_SELLING_PLAN = '';
  const groups = spgData.selling_plan_groups || [];
  // Look for a "subscribe & save" style group associated with the BYOB product.
  // The Recharge group usually has "subscribe" or "delivery" in its name.
  for (const g of groups) {
    if (/subscribe|delivery|recharge/i.test(g.name)) {
      // Check if associated with the BYOB product
      const assoc = await shopifyGet(`/selling_plan_groups/${g.id}/products.json?limit=5`);
      const hasByob = (assoc.products || []).some((p) => String(p.id) === BYOB_PRODUCT_ID);
      if (hasByob && g.selling_plans?.[0]) {
        BYOB_SELLING_PLAN = String(g.selling_plans[0].id);
        console.log('   Found selling plan:', BYOB_SELLING_PLAN, '(group:', g.name + ')');
        break;
      }
    }
  }
  if (!BYOB_SELLING_PLAN) {
    console.warn('   ⚠ Could not auto-detect selling plan. You may need to set BYOB_SELLING_PLAN manually.');
    console.warn('   Groups found:', groups.map((g) => g.name).join(', '));
  }

  // ── 3. Fetch products + collections ──
  const productCache    = {};   // handle → product JSON
  const collectionCache = {};   // handle → collectionId

  async function getProduct(handle) {
    if (productCache[handle]) return productCache[handle];
    const d = await shopifyGet(`/products.json?handle=${handle}`);
    productCache[handle] = d.products?.[0] || null;
    return productCache[handle];
  }

  async function getCollectionId(handle) {
    if (collectionCache[handle]) return collectionCache[handle];
    const d = await shopifyGet(`/custom_collections.json?handle=${handle}`);
    const col = d.custom_collections?.[0];
    if (col) { collectionCache[handle] = String(col.id); return collectionCache[handle]; }
    // Also try smart collections
    const d2 = await shopifyGet(`/smart_collections.json?handle=${handle}`);
    const col2 = d2.smart_collections?.[0];
    if (col2) { collectionCache[handle] = String(col2.id); return collectionCache[handle]; }
    return null;
  }

  function findVariant(product, packOptionText) {
    const needle = packOptionText.toLowerCase();
    if (!product) return null;
    return (
      product.variants.find((v) => v.title.toLowerCase().includes(needle)) ||
      product.variants.find((v) =>
        Object.values(v).some((x) => typeof x === 'string' && x.toLowerCase().includes(needle))
      ) ||
      product.variants[0]
    );
  }

  // ── 4. Resolve each pack ──
  console.log('\n→ Resolving pack variants…');
  const resolvedPacks = {};

  for (const [packKey, handle, packOption, collHandle] of PACK_DEFS) {
    process.stdout.write(`   ${packKey.padEnd(20)}`);

    const product = await getProduct(handle);
    if (!product) {
      console.log('⚠ product not found (handle:', handle + ')');
      resolvedPacks[packKey] = { variantId: 'NOT_FOUND', productId: 'NOT_FOUND', collectionId: 'NOT_FOUND' };
      continue;
    }

    const variant      = findVariant(product, packOption);
    const variantId    = String(variant?.id || 'NOT_FOUND');
    const productId    = String(product.id);

    let collectionId = 'NOT_FOUND';
    if (collHandle) {
      collectionId = (await getCollectionId(collHandle)) || 'NOT_FOUND';
    } else {
      // For products not in a BYOB collection, find their first collection
      const colData = await shopifyGet(`/products/${productId}/metafields.json`);
      // Fallback: get product collect (collection membership)
      const collectData = await shopifyGet(`/collects.json?product_id=${productId}&limit=1`);
      collectionId = String(collectData.collects?.[0]?.collection_id || 'NOT_FOUND');
    }

    resolvedPacks[packKey] = { variantId, productId, collectionId };
    console.log(`variantId=${variantId}  productId=${productId}  collectionId=${collectionId}`);
  }

  // ── 5. Write variant_map.js ──
  const output = `/**
 * STYRKR Variant Map  (auto-generated by populate_variant_map.js)
 * Generated: ${new Date().toISOString()}
 * Store: ${STORE}
 *
 * Review the resolved IDs below before deploying.
 * Pay attention to any NOT_FOUND entries and fill them in manually.
 */

window.STYRKR_VARIANT_MAP = {

  // Bundle product
  BYOB_PRODUCT_ID:   '${BYOB_PRODUCT_ID}',
  BYOB_VARIANT_ID:   '${BYOB_VARIANT_ID}',
  BYOB_SELLING_PLAN: '${BYOB_SELLING_PLAN}',

  packs: {
${Object.entries(resolvedPacks)
  .map(([pk, ids]) =>
    `    ${pk.padEnd(20)}: { variantId: '${ids.variantId}', productId: '${ids.productId}', collectionId: '${ids.collectionId}' },`
  )
  .join('\n')}
  },
};
`;

  const { writeFileSync } = await import('fs');
  writeFileSync('assets/variant_map.js', output, 'utf8');
  console.log('\n✓ Written to assets/variant_map.js');

  const notFound = Object.entries(resolvedPacks).filter(([, v]) => Object.values(v).includes('NOT_FOUND'));
  if (notFound.length > 0) {
    console.warn('\n⚠ The following packs have NOT_FOUND entries and need manual fixing:');
    notFound.forEach(([pk]) => console.warn('  -', pk));
  } else {
    console.log('✓ All packs resolved successfully.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
