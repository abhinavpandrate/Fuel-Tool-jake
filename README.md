# STYRKR Fuel Tool — Recharge Integration  (V4.1)

This package adds Recharge Bundles checkout integration to the Fuel Tool prototype.

---

## What's in this package

| File | Purpose |
|---|---|
| `assets/variant_map.js` | Config — Shopify IDs for every pack. **Fill in before deploying.** |
| `assets/recharge_checkout.js` | Recharge SDK checkout module (adds bundle to cart with `_rb_id`) |
| `prefill_bridge_byob.js` | Rewrites the old DOM bridge — now uses Recharge SDK + DOM fallback |
| `app_patch.js` | Documents the 4 changes to make in `app.js` |
| `html_snippets.html` | HTML snippets to add to `index.html` and the Shopify BYOB template |
| `populate_variant_map.js` | Node.js script to auto-fill `variant_map.js` via Admin API |

---

## Setup order

### Step 1 — Populate variant_map.js

**Option A: Automated (recommended)**
```bash
SHOPIFY_STORE=styrkr.myshopify.com \
SHOPIFY_TOKEN=shpat_xxxxxxxxxxxx \
node populate_variant_map.js
```
Review the output. Fix any `NOT_FOUND` entries by hand.

**Option B: Manual**
Open `assets/variant_map.js` and fill in each `FILL_ME_IN` value.

To find IDs quickly from the browser console on styrkr.com:
```js
// Get product variant IDs:
fetch('/products/mix90-dual-carb-drink.js').then(r=>r.json()).then(d=>d.variants.forEach(v=>console.log(v.title, v.id)))

// Get collection ID:
fetch('/collections/byob-energy-drink-powders/products.json?limit=1').then(r=>r.json()).then(console.log)
// Collection ID will be in the Shopify Admin — it's not exposed on the storefront JSON.
// Use Admin API: GET /admin/api/2024-01/custom_collections.json?handle=byob-energy-drink-powders
```

The **BYOB_SELLING_PLAN** ID is the Recharge selling plan for "Subscribe & Save".
Find it in: Recharge merchant portal → Subscriptions → Selling plans, or via:
```bash
curl -H "X-Shopify-Access-Token: $TOKEN" \
  "https://styrkr.myshopify.com/admin/api/2024-01/selling_plan_groups.json" | jq '.selling_plan_groups[] | {name, plans: [.selling_plans[].id]}'
```

---

### Step 2 — Apply app.js changes

Open `app_patch.js` and apply the 4 marked changes to `app.js`. They are:
1. Add `subscribe: true` to `state.bundle`
2. Replace the entire `addBundleToCart()` function
3. Add subscribe toggle listener in `wireBundleInputs()`
4. Update `addBtn30` wiring in `render()`

---

### Step 3 — Update index.html

Apply the snippets from `html_snippets.html`:
1. Add the subscribe toggle checkbox inside `#bundleForm`
2. Update the `<script>` loading order at the bottom of `<body>`

---

### Step 4 — Shopify theme (BYOB page)

Add the following to your BYOB product page template (e.g. `product.build-your-own-bundle.liquid`):

```liquid
{% if product.handle == 'build-your-own-bundle' %}
  <script src="{{ 'data.js' | asset_url }}" defer></script>
  <script src="{{ 'variant_map.js' | asset_url }}" defer></script>
  <script src="{{ 'recharge_checkout.js' | asset_url }}" defer></script>
  <script src="{{ 'prefill_bridge_byob.js' | asset_url }}" defer></script>
{% endif %}
```

Upload `data.js`, `variant_map.js`, `recharge_checkout.js`, `prefill_bridge_byob.js`
to Shopify Admin → Online Store → Themes → Assets.

---

## How the two flows work

### Flow A — Prefill + widget (default)
```
Fuel Tool → "Open BYOB (prefilled)" →
  styrkr.com/products/build-your-own-bundle?prefill=<base64>
  → prefill_bridge_byob.js parses payload
  → waits for Recharge widget to render
  → finds each product card by variant ID / URL handle / text
  → sets quantities via input or +/- buttons
  → customer reviews & clicks Recharge's own checkout CTA
```
Best for: letting the customer review + optionally change flavours before buying.

### Flow B — Express prefill (optional)
```
Fuel Tool → "Open BYOB (prefilled)" →
  styrkr.com/products/build-your-own-bundle?prefill=<base64>
  → prefill_bridge_byob.js (STYRKR_PREFILL_MODE = 'express')
  → calls STYRKR_RECHARGE.addRechargeBundle()
  → recharge.bundle.getBundleId() → _rb_id
  → POST /cart/add.js with BYOB variant + _rb_id + selling_plan
  → redirect /cart
```
Best for: highest conversion, minimal friction. Customer can still edit in cart.

### Flow C — Direct add to cart (from Fuel Tool)
```
Fuel Tool → "Add packs to cart" button →
  addBundleToCart() (in app.js) →
  STYRKR_RECHARGE.addRechargeBundle() →
  same as Flow B, but without leaving the Fuel Tool page first
```
Only works when the Fuel Tool is hosted on styrkr.com (same-origin).

---

## Debugging

All modules log to the browser console with `[STYRKR ...]` prefixes.

```js
// Check the prefill payload was parsed:
window.__STYRKR_PREFILL__

// Check the variant map:
window.STYRKR_VARIANT_MAP

// Check Recharge SDK is present:
window.recharge?.bundle

// Manually trigger a checkout (for testing):
const bundle = { lines: [{ packKey: 'GEL30_12', qty: 2 }] };
await window.STYRKR_RECHARGE.addRechargeBundle(bundle, true, console.log);
```

---

## Recharge bundle type

STYRKR uses a **fixed-price bundle**. The checkout flow uses `_rb_id` on the
parent BYOB product variant. If you ever switch to a dynamic-price bundle,
the flow changes significantly — `getDynamicBundleItems()` is used instead
and each child product is added to the cart separately with `_rc_bundle` properties.
See: https://storefront.rechargepayments.com/client/docs/examples/bundle/dynamic_price_bundle/
