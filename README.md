# STYRKR Fuel Tool – Minimal UI Prototype (V4)

This prototype rebuilds the Fuel Tool UI in a **black/white minimalist** aesthetic, using **#4dcdc6** as the sole accent colour for CTAs, and drives outputs from:

- `Fueltool + bundle Builder v2.xlsx` (rules, products, pack options, pricing)

## What’s included

- **Planner**: session + sweat + fueling inputs → targets → product plan (per‑hour + event totals)
- **Bundle Builder (30‑day)**: converts the per‑hour plan into a **30‑day** pack list using BYOB pack options + subscription pricing
  - Includes **per‑unit “drops” frames** (Mix / Gels / Bars / SLT)
- **BYOB prefilling**: generates a URL to open `build-your-own-bundle` with a `prefill=` payload
- **Add to cart**: attempts to add the recommended packs to Shopify cart (works only when hosted on `styrkr.com`)
- **Lead capture lock**: plan summary + non-planner tabs are blurred/locked until **Step 5** (name + email)

### Removed in V4 (intentionally)

- **Schedule tab** (30‑minute schedule)
- **Fuel card export** (9:16 PNG)

These can be re‑introduced once the bundle + checkout flow is locked down.

## File structure

- `index.html`
- `assets/styles.css` (monochrome grid UI + typography)
- `assets/data.js` (generated data extracted from the spreadsheet)
- `assets/app.js` (calculator + UI)
- `prefill_bridge_byob.js` (reference script to read the `prefill` payload on the BYOB page)

## How to run

Open `index.html` in a browser.

### Lead capture lock

By default, the **Plan summary** panel is blurred and the **Bundle Builder / Notes** tabs are disabled until Step 5 is completed.

- In **local mode** (`file://`, `localhost`), any non-empty name + email are accepted.
- When hosted, the email field requires a basic email format.

Captured values are stored in `localStorage` under `styrkr_fuel_tool_lead_v1` (prototype behaviour).

If you host this inside the STYRKR Shopify theme (recommended), the **Add to cart** button will be able to call `/cart/add.js` on the same origin.

## BYOB prefilling payload format

The fuel tool generates a link like:

`https://styrkr.com/products/build-your-own-bundle?prefill=<base64url(JSON)>`

Where JSON is:

```json
{
  "v": 1,
  "generatedAt": "2026-02-20T12:34:56.000Z",
  "planner": { "activity": "Cycling", "durationH": 3, "planStyle": "Balanced", ... },
  "lines": [{ "packKey": "GEL30_6", "qty": 1 }, { "packKey": "MIX60_12", "qty": 2 }]
}
```

To actually apply this on the BYOB page, you’ll need a small bridge script (see `prefill_bridge_byob.js`) that:

1) parses `prefill`
2) matches `packKey` rows in the bundle builder UI
3) sets quantities programmatically

