/**
 * STYRKR app.js — Recharge Integration Patch
 * ────────────────────────────────────────────
 * This file shows the EXACT changes to make in app.js.
 * Search for each REPLACE block and swap it for the NEW block below it.
 *
 * Changes summary:
 *  1. addBundleToCart() — completely rewritten to use STYRKR_RECHARGE
 *  2. render() — adds subscribe toggle + updates button wiring
 *  3. wireBundleInputs() — adds subscribe toggle listener
 *  4. state — adds subscribe flag
 */

// ════════════════════════════════════════════════════════════════════════════
// CHANGE 1 of 4
// In: state object (around line 35)
// ════════════════════════════════════════════════════════════════════════════

// ── REPLACE THIS ──
/*
  const state = {
    ...
    bundle: {
      sessions30d: 8,
      avgSessionH: 1.5,
      fuelledPct: 0.75,
      applyDiscount: true,
    },
  };
*/

// ── WITH THIS ──
/*
  const state = {
    ...
    bundle: {
      sessions30d: 8,
      avgSessionH: 1.5,
      fuelledPct: 0.75,
      applyDiscount: true,
      subscribe: true,      // ← NEW: drives selling_plan in Recharge checkout
    },
  };
*/


// ════════════════════════════════════════════════════════════════════════════
// CHANGE 2 of 4
// In: addBundleToCart() — replace the ENTIRE function (lines ~515–623)
// ════════════════════════════════════════════════════════════════════════════

// ── REPLACE THIS ──
/*
  async function addBundleToCart(bundle, noteEl) {
    if (!bundle.lines.length) return;

    // Only works when hosted on styrkr.com (same-origin to Shopify /cart endpoints)
    const host = (location.hostname || "").toLowerCase();
    if (!host.includes("styrkr")) {
      if (noteEl) {
        noteEl.style.display = "block";
        noteEl.textContent = "Add to cart is only available when this tool is hosted on styrkr.com.";
      }
      return;
    }

    // ... [all the old variant-resolution code] ...
  }
*/

// ── WITH THIS ──

  async function addBundleToCart(bundle, noteEl) {
    if (!bundle || !bundle.lines || bundle.lines.length === 0) return;

    const host = (location.hostname || '').toLowerCase();

    // ── Not on styrkr.com: show a helpful message and offer the prefill link ──
    if (!host.includes('styrkr')) {
      if (noteEl) {
        noteEl.style.display = 'block';
        noteEl.innerHTML =
          'Add to cart is only available when hosted on <strong>styrkr.com</strong>. ' +
          'Use the "Open BYOB (prefilled)" link above to go straight to the bundle builder.';
      }
      return;
    }

    // ── Recharge module required ──
    if (!window.STYRKR_RECHARGE) {
      if (noteEl) {
        noteEl.style.display = 'block';
        noteEl.textContent = 'Recharge checkout module not loaded. Ensure recharge_checkout.js is included.';
      }
      return;
    }

    // ── Delegate to STYRKR_RECHARGE ──
    const subscribe = !!state.bundle.subscribe;

    await window.STYRKR_RECHARGE.addRechargeBundle(
      bundle,
      subscribe,
      (msg, isError) => {
        if (!noteEl) return;
        noteEl.style.display = 'block';
        noteEl.textContent   = msg;
        noteEl.classList.toggle('notice--warn', isError);
      }
    );
  }


// ════════════════════════════════════════════════════════════════════════════
// CHANGE 3 of 4
// In: wireBundleInputs() — add a subscribe toggle listener (around line 1250)
// ════════════════════════════════════════════════════════════════════════════

// ── After the existing disc.addEventListener block, ADD ──

/*
    // Subscribe toggle (controls whether Recharge selling_plan is sent)
    const subToggle = $('bundleSubscribe');
    if (subToggle) {
      subToggle.checked = state.bundle.subscribe;
      subToggle.addEventListener('change', (e) => {
        state.bundle.subscribe = !!e.target.checked;
        render();
      });
    }
*/


// ════════════════════════════════════════════════════════════════════════════
// CHANGE 4 of 4
// In: render() — update the addBtn30 wiring (around line 1305)
// ════════════════════════════════════════════════════════════════════════════

// ── REPLACE THIS ──
/*
    const addBtn30 = $("addBundleToCartBtn30");
    if (addBtn30) {
      addBtn30.onclick = () =>
        addBundleToCart(bundle30, $("bundle30CtaNote")).catch((e) => {
          console.warn(e);
          const n = $("bundle30CtaNote");
          if (n) {
            n.style.display = "block";
            n.textContent = "Add to cart failed (see console).";
          }
        });
    }
*/

// ── WITH THIS ──
/*
    const addBtn30   = $('addBundleToCartBtn30');
    const ctaNote30  = $('bundle30CtaNote');
    if (addBtn30) {
      addBtn30.disabled    = !bundle30.lines.length;
      addBtn30.textContent = state.bundle.subscribe ? 'Subscribe & add to cart' : 'Add to cart (one-time)';
      addBtn30.onclick     = () =>
        addBundleToCart(bundle30, ctaNote30).catch((e) => {
          console.warn('[STYRKR] addBundleToCart error:', e);
          if (ctaNote30) {
            ctaNote30.style.display = 'block';
            ctaNote30.textContent   = 'Failed — ' + e.message;
          }
        });
    }
*/
