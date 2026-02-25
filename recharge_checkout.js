/**
 * STYRKR Recharge Bundle Checkout
 * ─────────────────────────────────
 * Handles the "direct to checkout" path for the Fuel Tool.
 *
 * Depends on:
 *   - window.STYRKR_VARIANT_MAP  (assets/variant_map.js)
 *   - window.recharge            (Recharge storefront JS SDK, loaded by Shopify theme)
 *
 * The Recharge SDK is available as `window.recharge` on every page where
 * the Recharge theme extension is active. On the BYOB product page it is
 * always present; if you embed the Fuel Tool on another page you may need to
 * explicitly load the SDK:
 *
 *   <script src="https://static.rechargecdn.com/client/[VERSION]/recharge.umd.js"></script>
 *
 * Flow
 * ─────────────────────
 *  1. Build Recharge `bundle` object from the Fuel Tool's pack lines
 *  2. Call recharge.bundle.getBundleId(bundle)  →  _rb_id
 *  3. POST /cart/add.js with the BYOB parent variant + _rb_id property +
 *     selling_plan for subscribe & save
 *  4. Redirect to /cart (or /checkout for express)
 *
 * FIXED-PRICE vs DYNAMIC
 * ─────────────────────
 * STYRKR uses a FIXED-PRICE bundle (one parent product, child selections tracked
 * via _rb_id). Dynamic bundles use a different flow (_rc_bundle property on each
 * child line item). See Recharge SDK docs if you ever switch types.
 */

(function () {
  'use strict';

  const MAP = window.STYRKR_VARIANT_MAP;

  // ── Sanity checks ──────────────────────────────────────────────────────────

  function isMapsReady() {
    if (!MAP) {
      console.error('[STYRKR Checkout] STYRKR_VARIANT_MAP is not loaded. Ensure variant_map.js is included before recharge_checkout.js.');
      return false;
    }
    if (MAP.BYOB_PRODUCT_ID === 'FILL_ME_IN') {
      console.error('[STYRKR Checkout] variant_map.js has not been filled in. Please add real Shopify IDs.');
      return false;
    }
    return true;
  }

  function isRechargeReady() {
    return typeof window.recharge !== 'undefined' && typeof window.recharge.bundle !== 'undefined';
  }

  function waitForRecharge(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      if (isRechargeReady()) { resolve(); return; }
      const start = Date.now();
      const timer = setInterval(() => {
        if (isRechargeReady()) { clearInterval(timer); resolve(); return; }
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('Recharge SDK not available after ' + timeoutMs + 'ms. Is this page on styrkr.com with the Recharge theme extension active?'));
        }
      }, 100);
    });
  }

  // ── Build Recharge bundle object from pack lines ───────────────────────────

  /**
   * @param {Array<{packKey: string, qty: number}>} lines  — from computeBundlePacks()
   * @returns {{ externalProductId, externalVariantId, selections[] } | null}
   */
  function buildRechargeBundle(lines) {
    if (!isMapsReady()) return null;

    const selections = [];

    for (const line of lines) {
      if (!line.qty || line.qty <= 0) continue;

      const entry = MAP.packs[line.packKey];
      if (!entry) {
        console.warn('[STYRKR Checkout] No variant map entry for packKey:', line.packKey, '— skipping.');
        continue;
      }
      if (entry.variantId === 'FILL_ME_IN') {
        console.warn('[STYRKR Checkout] variantId not filled in for packKey:', line.packKey, '— skipping.');
        continue;
      }

      // Recharge selections are per-unit; qty > 1 means repeat the selection qty times
      // OR set quantity on the selection object. Recharge accepts quantity field.
      selections.push({
        collectionId:      String(entry.collectionId),
        externalProductId: String(entry.productId),
        externalVariantId: String(entry.variantId),
        quantity:          Number(line.qty),
      });
    }

    if (selections.length === 0) {
      console.warn('[STYRKR Checkout] No valid selections resolved. Check variant_map.js entries.');
      return null;
    }

    return {
      externalProductId: String(MAP.BYOB_PRODUCT_ID),
      externalVariantId: String(MAP.BYOB_VARIANT_ID),
      selections,
    };
  }

  // ── Main add-to-cart function ──────────────────────────────────────────────

  /**
   * Adds the athlete's recommended bundle to the Shopify cart via the Recharge SDK.
   *
   * @param {Object}   bundle          — output of computeBundlePacks() in app.js
   * @param {boolean}  [subscribe=true] — true = subscribe & save (uses BYOB_SELLING_PLAN)
   * @param {Function} [onStatus]      — optional callback(message, isError) for UI feedback
   * @returns {Promise<void>}
   */
  async function addRechargeBundle(bundle, subscribe = true, onStatus = null) {
    const status = (msg, isError = false) => {
      console[isError ? 'error' : 'info']('[STYRKR Checkout]', msg);
      if (onStatus) onStatus(msg, isError);
    };

    if (!bundle || !bundle.lines || bundle.lines.length === 0) {
      status('No bundle lines to add.', true);
      return;
    }

    if (!isMapsReady()) {
      status('Variant map not configured. Contact the developer to fill in variant_map.js.', true);
      return;
    }

    // ── 1. Wait for Recharge SDK ──
    status('Connecting to Recharge…');
    try {
      await waitForRecharge();
    } catch (e) {
      status(e.message, true);
      return;
    }

    // ── 2. Build the bundle object ──
    const rechargeBundle = buildRechargeBundle(bundle.lines);
    if (!rechargeBundle) {
      status('Could not map pack selections to Shopify variants. Check variant_map.js.', true);
      return;
    }

    // ── 3. Validate with Recharge SDK ──
    status('Validating bundle…');
    try {
      const validationResult = await window.recharge.bundle.validateBundle(rechargeBundle);
      if (validationResult !== true) {
        status('Recharge bundle validation failed: ' + validationResult, true);
        return;
      }
    } catch (e) {
      // validateBundle can throw for fixed-price bundles if collections/products
      // are not recognised — treat as a warning and continue (Recharge is inconsistent here)
      console.warn('[STYRKR Checkout] validateBundle threw:', e.message, '— continuing anyway.');
    }

    // ── 4. Get _rb_id from Recharge ──
    status('Generating bundle ID…');
    let rbId;
    try {
      rbId = await window.recharge.bundle.getBundleId(rechargeBundle);
    } catch (e) {
      status('getBundleId failed: ' + e.message + '. Check that collectionId/productId/variantId values in variant_map.js are correct.', true);
      return;
    }

    // ── 5. Build cart payload ──
    const cartItem = {
      id:       String(MAP.BYOB_VARIANT_ID),
      quantity: 1,
      properties: { _rb_id: rbId },
    };

    if (subscribe && MAP.BYOB_SELLING_PLAN && MAP.BYOB_SELLING_PLAN !== 'FILL_ME_IN') {
      cartItem.selling_plan = Number(MAP.BYOB_SELLING_PLAN);
    } else if (subscribe) {
      console.warn('[STYRKR Checkout] Subscribe requested but BYOB_SELLING_PLAN is not set in variant_map.js. Adding as one-time.');
    }

    // ── 6. Add to Shopify cart ──
    status('Adding to cart…');
    const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    const res = await fetch(root + 'cart/add.js', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({ items: [cartItem] }),
    });

    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()); } catch (_) {}
      status('Cart add failed (HTTP ' + res.status + '). ' + detail, true);
      return;
    }

    // ── 7. Redirect ──
    status('Added to cart! Redirecting…');
    window.location.href = root + 'cart';
  }

  // ── Expose on window ───────────────────────────────────────────────────────

  window.STYRKR_RECHARGE = {
    addRechargeBundle,
    buildRechargeBundle,
    waitForRecharge,
  };

})();
