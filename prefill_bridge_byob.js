/**
 * STYRKR BYOB Prefill Bridge (reference implementation)
 * ----------------------------------------------------
 * This file is NOT auto-injected by the Fuel Tool.
 *
 * Goal:
 *  - Read ?prefill=<base64url(JSON)> on:
 *    https://styrkr.com/products/build-your-own-bundle
 *  - Convert the payload into UI selections in the bundle builder
 *
 * Notes:
 *  - Bundle builders are often third-party apps with their own DOM + APIs.
 *  - This script includes a "best-effort" DOM strategy:
 *      1) find elements containing packKey text
 *      2) locate a quantity input or +/- buttons in the same row/card
 *      3) set/click to reach requested quantity
 *  - You will likely need to tweak selectors based on the actual app markup.
 */

(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("prefill");
  if (!token) return;

  function base64UrlDecode(b64url) {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(token));
  } catch (e) {
    console.warn("[STYRKR Prefill] Invalid payload", e);
    return;
  }

  if (!payload || !Array.isArray(payload.lines)) return;

  // Expose for debugging
  window.__STYRKR_PREFILL__ = payload;

  const lines = payload.lines.filter((l) => l && l.packKey && Number(l.qty) > 0);

  function findRowByPackKey(packKey) {
    const needles = [
      `[data-pack-key="${CSS.escape(packKey)}"]`,
      `[data-pack="${CSS.escape(packKey)}"]`,
    ];
    for (const sel of needles) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Text scan fallback
    const candidates = Array.from(document.querySelectorAll("a, button, div, span, h3, h4, p"));
    const hit = candidates.find((el) => (el.textContent || "").trim() === packKey);
    return hit ? hit.closest("li, tr, .bundle-item, .product-card, .card, div") || hit.parentElement : null;
  }

  function setQtyInRow(rowEl, qty) {
    if (!rowEl) return false;

    // 1) Quantity input
    const input =
      rowEl.querySelector('input[type="number"]') ||
      rowEl.querySelector('input[name*="quantity"]') ||
      rowEl.querySelector("input.qty") ||
      rowEl.querySelector("input[data-quantity]");
    if (input) {
      input.value = String(qty);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // 2) +/- buttons
    const plus =
      rowEl.querySelector('button[aria-label*="plus" i]') ||
      rowEl.querySelector('button[aria-label*="increase" i]') ||
      rowEl.querySelector('button[data-action="increase"]') ||
      rowEl.querySelector('button[class*="plus" i]');

    const minus =
      rowEl.querySelector('button[aria-label*="minus" i]') ||
      rowEl.querySelector('button[aria-label*="decrease" i]') ||
      rowEl.querySelector('button[data-action="decrease"]') ||
      rowEl.querySelector('button[class*="minus" i]');

    // Try to read current qty
    const current =
      Number((rowEl.querySelector('[data-qty]') || rowEl.querySelector(".qty") || {}).textContent) ||
      Number((rowEl.querySelector(".quantity") || {}).textContent) ||
      0;

    if (!plus && !minus) return false;

    const delta = qty - current;
    const btn = delta > 0 ? plus : minus;
    if (!btn) return false;

    for (let i = 0; i < Math.abs(delta); i++) btn.click();
    return true;
  }

  function applyPrefill() {
    let applied = 0;
    for (const line of lines) {
      const row = findRowByPackKey(line.packKey);
      const ok = setQtyInRow(row, Number(line.qty));
      if (ok) applied++;
    }

    console.info(`[STYRKR Prefill] Applied ${applied}/${lines.length} lines`);
  }

  // The bundle builder UI is usually mounted asynchronously; poll briefly.
  const maxMs = 15000;
  const start = Date.now();
  const timer = setInterval(() => {
    const ready =
      document.querySelector("[data-bundle-builder]") ||
      document.querySelector(".bundle-builder") ||
      document.querySelector("#bundle-builder") ||
      document.querySelector("form[action*='/cart/add']");
    if (ready || Date.now() - start > maxMs) {
      clearInterval(timer);
      applyPrefill();
    }
  }, 250);
})();
