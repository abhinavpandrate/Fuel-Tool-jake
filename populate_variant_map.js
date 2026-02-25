#!/usr/bin/env node
/**
 * STYRKR — Auto-populate variant_map.js
 * ──────────────────────────────────────
 * Usage:
 *   SHOPIFY_STORE=styrkr.myshopify.com \
 *   SHOPIFY_TOKEN=shpat_xxxxxxxxxxxx \
 *   node populate_variant_map.js
 */

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_TOKEN;

if (!STORE || !TOKEN) {
  console.error('Set SHOPIFY_STORE and SHOPIFY_TOKEN environment variables.');
  process.exit(1);
}

const API_VERSION = '2025-10';
const BASE = `https://${STORE}/admin/api/${API_VERSION}`;
const HEADERS = { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' };

async function shopifyGet(path) {
  const res = await fetch(BASE + path, { headers: HEADERS });
  if (!res.ok) throw new Error(`Shopify API error ${res.status} on ${path}`);
  return res.json();
}

const PACK_DEFS = [
  ['MIX60_6',        'mix60-dual-carb-drink',                              '6 pack',            'byob-energy-drink-powders'],
  ['MIX60_12',       'mix60-dual-carb-drink',                              '12 pack',           'byob-energy-drink-powders'],
  ['MIX90_6',        'mix90-dual-carb-drink',                              '6 pack',            'byob-energy-drink-powders'],
  ['MIX90_12',       'mix90-dual-carb-drink',                              '12 pack',           'byob-energy-drink-powders'],
  ['MIX90_CAFF_6',   'mix90-caffeine-dual-carb-drink',                     '6 pack',            'byob-energy-drink-powders'],
  ['MIX90_CAFF_12',  'mix90-caffeine-dual-carb-drink',                     '12 pack',           'byob-energy-drink-powders'],
  ['MIXPLUS_15',     'byob-mix-pink-grapefruit-dual-carb-electrolyte-mix', '556g tub',          null],
  ['MIXPLUS_25',     'byob-mix-pink-grapefruit-dual-carb-electrolyte-mix', '926g tub',          null],
  ['GEL30_6',        'vq-byob-gel30-dual-carb-energy-gel-1x-copy',         '6 pack',            null],
  ['GEL30_12',       'vq-byob-gel30-dual-carb-energy-gel-1x-copy',         '12 pack',           null],
  ['GEL30_CAFF_6',   'vq-byob-gel30-caffeine-energy-gel-1x-copy',          '6 pack',            null],
  ['GEL30_CAFF_12',  'vq-byob-gel30-caffeine-energy-gel-1x-copy',          '12 pack',           null],
  ['GEL50_12',       'gel50-dual-carb-energy-gel-citrus-fruits-copy',       '12 pack',           null],
  ['BAR30_12',       'bar30-high-carb-rice-energy-bar',                     '12 pack',           null],
  ['BAR50_6',        'bar50-variety-pack-energy-bars',                      '6 pack',            'byob-high-carb-bars'],
  ['BAR50_12',       'bar50-variety-pack-energy-bars',                      '12 pack',           'byob-high-carb-bars'],
  ['SLT07_500_T12',  'slt07-hydration-tablets-mild-berry-500mg',            'Tube of 12',        null],
  ['SLT07_500_B3',   'slt07-hydration-tablets-mild-berry-500mg',            'Box of 3',          null],
  ['SLT07_500_B6',   'slt07-hydration-tablets-mild-berry-500mg',            'Box of 6',          null],
  ['SLT07_1000_T12', 'slt07-hydration-tablets-mild-citrus',                 'Tube of 12',        null],
  ['SLT07_1000_B3',  'slt07-hydration-tablets-mild-citrus',                 'Box of 3',          null],
  ['SLT07_1000_B6',  'slt07-hydration-tablets-mild-citrus',                 'Box of 6',          null],
  ['SLTPLUS_30',     'slt-plus',                                            'Box (30 servings)', null],
];

async function run() {
  console.log('Fetching Shopify data from', STORE, '…\n');

  // ── 1. BYOB bundle product ──
  console.log('→ Fetching build-your-own-bundle product…');
  const byobData = await shopifyGet('/products.json?handle=build-your-own-bundle');
  const byobProduct = byobData.products?.[0];
  if (!byobProduct) {
    console.error('Could not find product with handle build-your-own-bundle');
    process.exit(1);
  }
  const BYOB_PRODUCT_ID = String(byobProduct.id);
  const BYOB_VARIANT_ID = String(byobProduct.variants?.[0]?.id || '');
  console.log('   BYOB product ID:', BYOB_PRODUCT_ID, '  variant ID:', BYOB_VARIANT_ID);

  // ── 2. Selling plan — fill in manually from Recharge portal ──
  const BYOB_SELLING_PLAN = 'FILL_ME_IN';
  console.log('→ Skipping selling plan — fill in manually from Recharge portal (see README).\n');

  // ── 3. Product + collection helpers ──
  const productCache    = {};
  const collectionCache = {};

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
  console.log('→ Resolving pack variants…');
  const resolvedPacks = {};

  for (const [packKey, handle, packOption, collHandle] of PACK_DEFS) {
    process.stdout.write(`   ${packKey.padEnd(20)}`);

    const product = await getProduct(handle);
    if (!product) {
      console.log('⚠ product not found (handle:', handle + ')');
      resolvedPacks[packKey] = { variantId: 'NOT_FOUND', productId: 'NOT_FOUND', collectionId: 'NOT_FOUND' };
      continue;
    }

    const variant   = findVariant(product, packOption);
    const variantId = String(variant?.id || 'NOT_FOUND');
    const productId = String(product.id);

    let collectionId = 'NOT_FOUND';
    if (collHandle) {
      collectionId = (await getCollectionId(collHandle)) || 'NOT_FOUND';
    } else {
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
 * BYOB_SELLING_PLAN: get this from Recharge merchant portal
 *   → Subscriptions → Selling plans → click your Subscribe & Save plan → copy the ID from the URL
 */

window.STYRKR_VARIANT_MAP = {

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
  writeFileSync('variant_map.js', output, 'utf8');
  console.log('\n✓ Written to variant_map.js');

  const notFound = Object.entries(resolvedPacks).filter(([, v]) => Object.values(v).includes('NOT_FOUND'));
  if (notFound.length > 0) {
    console.warn('\n⚠ The following packs have NOT_FOUND entries — fix manually:');
    notFound.forEach(([pk]) => console.warn('  -', pk));
  } else {
    console.log('✓ All packs resolved successfully.');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
