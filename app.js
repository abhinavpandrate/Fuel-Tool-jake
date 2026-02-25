/* STYRKR Fuel Tool – UI + Calculation Engine
   Data source: window.STYRKR_DATA (generated from Fueltool + bundle Builder v2.xlsx)

   This is a prototype UI focused on:
   - Minimal black/white grid aesthetic (STYRKR accents)
   - Transparent formulas (mirrors the spreadsheet logic)
   - Product plan + bundle builder pack pricing
*/

(function () {
  const DATA = window.STYRKR_DATA;
  if (!DATA) {
    console.error("Missing STYRKR_DATA. Ensure assets/data.js is loaded first.");
    return;
  }

  const $ = (id) => document.getElementById(id);

  const SKUS_ORDER = [
    "MIXPLUS",
    "MIX60",
    "MIX90",
    "MIX90_CAFF",
    "GEL30",
    "GEL30_CAFF",
    "GEL50",
    "BAR30",
    "BAR50",
    "SLT07_500",
    "SLT07_1000",
    "SLTPLUS",
  ];

  // ----- State -----
  const state = {
    view: "planner",
    step: 0,
    lead: {
      name: "",
      email: "",
      unlocked: false,
      capturedAt: null,
    },
    planner: {
      activity: Object.keys(DATA.rules.activity_multiplier)[0] || "Cycling",
      durationH: 3,
      rpe: 6,
      conditions: Object.keys(DATA.rules.conditions_fluid_adj_mlph)[1] || Object.keys(DATA.rules.conditions_fluid_adj_mlph)[0],
      bottleSizeMl: 750,
      sweatRate: Object.keys(DATA.rules.sweat_rate_mlph)[2] || Object.keys(DATA.rules.sweat_rate_mlph)[0],
      sweatSalt: Object.keys(DATA.rules.sweat_sodium_mgL)[1] || Object.keys(DATA.rules.sweat_sodium_mgL)[0],
      carbMode: Object.keys(DATA.rules.carb_mode_caps)[0] || "Standard",
      caffeineProtocol: "None",
      caffeineCustom: 0.25,
      planStyle: "Balanced",
      sodiumRepl: 0.5,
    },
    bundle: {
      sessions30d: 8,
      avgSessionH: 1.5,
      fuelledPct: 0.75,
      applyDiscount: true,
    },
  };

  const STORAGE_KEY_LEAD = "styrkr_fuel_tool_lead_v1";

  // ----- Utilities -----
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const round = (x, dp = 0) => {
    const p = Math.pow(10, dp);
    return Math.round(x * p) / p;
  };
  const ceil = (x) => Math.ceil(x - 1e-9); // protect from floating point noise
  const fmt = (x, dp = 0) => (Number.isFinite(x) ? x.toFixed(dp) : "—");


  function toClipboard(text) {
    if (!navigator.clipboard) return Promise.reject(new Error("Clipboard API unavailable"));
    return navigator.clipboard.writeText(text);
  }

  function base64UrlEncode(str) {
    // Encode unicode safely
    const utf8 = new TextEncoder().encode(str);
    let bin = "";
    utf8.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function isLocalMode() {
    const proto = String(location.protocol || "").toLowerCase();
    const host = String(location.hostname || "").toLowerCase();
    return proto === "file:" || host === "" || host === "localhost" || host === "127.0.0.1";
  }

  function safeParseJson(str) {
    try {
      return JSON.parse(str);
    } catch (_) {
      return null;
    }
  }

  function loadLead() {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY_LEAD);
    if (!raw) return;
    const obj = safeParseJson(raw);
    if (!obj || typeof obj !== "object") return;
    const name = String(obj.name || "").trim();
    const email = String(obj.email || "").trim();
    if (!name || !email) return;
    state.lead.name = name;
    state.lead.email = email;
    state.lead.unlocked = true;
    state.lead.capturedAt = obj.capturedAt || null;
  }

  function saveLead() {
    if (!state.lead.unlocked) return;
    if (typeof localStorage === "undefined") return;
    const payload = {
      name: state.lead.name,
      email: state.lead.email,
      capturedAt: state.lead.capturedAt || new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY_LEAD, JSON.stringify(payload));
    } catch (_) {
      // Ignore storage errors (private mode, etc.)
    }
  }

  function isValidEmail(email) {
    const e = String(email || "").trim();
    // Intentionally simple: enough to block obvious junk when hosted.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  function validateLeadInputs(name, email) {
    const n = String(name || "").trim();
    const e = String(email || "").trim();
    if (!n || !e) return { ok: false, message: "Enter both name and email to unlock the plan." };
    if (!isLocalMode() && !isValidEmail(e)) return { ok: false, message: "Enter a valid email address to continue." };
    return { ok: true, message: "" };
  }

  function durationBand(durationH) {
    if (durationH < 1) return "<1h";
    if (durationH < 2) return "1–2h";
    if (durationH < 3) return "2–3h";
    if (durationH < 5) return "3–5h";
    if (durationH < 8) return "5–8h";
    return "8h+";
  }

  function lookupRpeFactor(rpe) {
    const thr = [...DATA.rules.rpe_factor_thresholds].sort((a, b) => a.min_rpe - b.min_rpe);
    let f = thr[0]?.factor ?? 1;
    for (const t of thr) {
      if (rpe >= t.min_rpe) f = t.factor;
      else break;
    }
    return f;
  }

  function caffeineFraction() {
    if (state.planner.caffeineProtocol === "Custom") return clamp(Number(state.planner.caffeineCustom) || 0, 0, 0.75);
    return Number(DATA.rules.caffeine_fraction[state.planner.caffeineProtocol] ?? 0);
  }

  function getProduct(sku) {
    return DATA.products[sku];
  }

  function getPack(packKey) {
    return DATA.packs[packKey];
  }

  function pickPackKeyByUnits(sku, unitsPerPack) {
    const keys = DATA.packs_by_sku[sku] || [];
    return keys.find((k) => Number(DATA.packs[k].units_per_pack) === Number(unitsPerPack)) || null;
  }

  // ----- Core calculations (mirrors spreadsheet logic) -----
  function computeTargets() {
    const p = state.planner;

    const activityMult = Number(DATA.rules.activity_multiplier[p.activity] ?? 1);
    const rpeFactor = lookupRpeFactor(Number(p.rpe));
    const band = durationBand(Number(p.durationH));

    // Spreadsheet uses the "Mid" column for each duration band
    const bandRow = DATA.rules.duration_bands.find((d) => d.band === band);
    const baseCarb = Number(bandRow?.mid ?? 0) * rpeFactor;

    const carbCap = Number(DATA.rules.carb_mode_caps[p.carbMode] ?? 90);
    const carbTargetGph = Math.min(carbCap, Math.round(baseCarb * activityMult));

    // Fluid target (ml/h)
    const baseFluid = Number(DATA.rules.sweat_rate_mlph[p.sweatRate] ?? 800);
    const condAdj = Number(DATA.rules.conditions_fluid_adj_mlph[p.conditions] ?? 0);
    const intensityAdj = (Number(p.rpe) - 5) * 25;
    const fluidTargetMlph = clamp(baseFluid + condAdj + intensityAdj, 300, 1200);

    // Sweat sodium concentration (mg/L)
    const sweatNaMgL = Number(DATA.rules.sweat_sodium_mgL[p.sweatSalt] ?? 900);

    // Sodium target (mg/h) = (fluid_L/h * sweatNa_mg/L) * replacement factor
    const sodiumTargetMgph = Math.round((fluidTargetMlph / 1000) * sweatNaMgL * Number(p.sodiumRepl));

    return {
      activityMult,
      rpeFactor,
      band,
      baseCarb,
      carbCap,
      carbTargetGph,
      baseFluid,
      condAdj,
      intensityAdj,
      fluidTargetMlph,
      sweatNaMgL,
      sodiumTargetMgph,
      caffFrac: caffeineFraction(),
    };
  }

  function computePlanPerHour(targets) {
    const p = state.planner;
    const style = DATA.rules.plan_styles[p.planStyle];
    if (!style) {
      return { perHour: {}, debug: { error: "Unknown plan style" } };
    }

    const dur = Number(p.durationH);
    const W = dur < 2 ? 0 : dur < 3 ? 0.5 : 1;

    const X = Number(style.drink_share);
    const Z = Number(style.bar_share) * W;
    const Y = Number(style.gel_share) + (Number(style.bar_share) - Z); // shift missing bar share to gels

    const drinkCarbs = targets.carbTargetGph * X;
    const gelCarbs = targets.carbTargetGph * Y;
    const barCarbs = targets.carbTargetGph * Z;

    const caff = targets.caffFrac;

    // Drink products (piecewise mapping from spreadsheet)
    const mixPlus = getProduct("MIXPLUS");
    const mix60 = getProduct("MIX60");
    const mix90 = getProduct("MIX90");
    const mix90Caff = getProduct("MIX90_CAFF");

    const mixPlusPerH = drinkCarbs <= 35 ? drinkCarbs / mixPlus.carbs_g : 0;
    const mix60PerH = drinkCarbs > 35 && drinkCarbs <= 70 ? drinkCarbs / mix60.carbs_g : 0;
    const mix90PerH = drinkCarbs > 70 ? (drinkCarbs * (1 - caff)) / mix90.carbs_g : 0;
    const mix90CaffPerH = drinkCarbs > 70 ? (drinkCarbs * caff) / mix90Caff.carbs_g : 0;

    // Gels
    const gel30 = getProduct("GEL30");
    const gel30Caff = getProduct("GEL30_CAFF");
    const gel50 = getProduct("GEL50");

    const gel30CaffPerH = (gelCarbs * caff) / gel30Caff.carbs_g;
    const gel50PerH = (gelCarbs * (1 - caff) * Number(style.gel50_share)) / gel50.carbs_g;
    const gel30PerH = (gelCarbs * (1 - caff) * (1 - Number(style.gel50_share))) / gel30.carbs_g;

    // Bars
    const bar30 = getProduct("BAR30");
    const bar50 = getProduct("BAR50");

    const bar50PerH = barCarbs === 0 ? 0 : (barCarbs * Number(style.bar50_share)) / bar50.carbs_g;
    const bar30PerH = barCarbs === 0 ? 0 : (barCarbs * (1 - Number(style.bar50_share))) / bar30.carbs_g;

    // Sodium from drinks + bars (gels assumed 0 sodium in the model)
    const sodiumFrom =
      mixPlusPerH * mixPlus.sodium_mg +
      mix60PerH * mix60.sodium_mg +
      mix90PerH * mix90.sodium_mg +
      mix90CaffPerH * mix90Caff.sodium_mg +
      bar30PerH * bar30.sodium_mg +
      bar50PerH * bar50.sodium_mg;

    const sodiumRemaining = Math.max(0, targets.sodiumTargetMgph - sodiumFrom);

    // Electrolytes: choose one tier based on remaining sodium per hour
    const slt500 = getProduct("SLT07_500");
    const slt1000 = getProduct("SLT07_1000");
    const sltPlus = getProduct("SLTPLUS");

    const slt500PerH = sodiumRemaining > 0 && sodiumRemaining <= 500 ? sodiumRemaining / slt500.sodium_mg : 0;
    const slt1000PerH = sodiumRemaining > 500 && sodiumRemaining <= 1000 ? sodiumRemaining / slt1000.sodium_mg : 0;
    const sltPlusPerH = sodiumRemaining > 1000 ? sodiumRemaining / sltPlus.sodium_mg : 0;

    const perHour = {
      MIX60: mix60PerH,
      MIX90: mix90PerH,
      MIX90_CAFF: mix90CaffPerH,
      MIXPLUS: mixPlusPerH,
      GEL30: gel30PerH,
      GEL30_CAFF: gel30CaffPerH,
      GEL50: gel50PerH,
      BAR30: bar30PerH,
      BAR50: bar50PerH,
      SLT07_500: slt500PerH,
      SLT07_1000: slt1000PerH,
      SLTPLUS: sltPlusPerH,
    };

    const drinkMlph = 500 * (mixPlusPerH + mix60PerH + mix90PerH + mix90CaffPerH);

    const caffeineMgph = mix90CaffPerH * mix90Caff.caffeine_mg + gel30CaffPerH * gel30Caff.caffeine_mg;

    return {
      perHour,
      debug: {
        W,
        X,
        Y,
        Z,
        drinkCarbs,
        gelCarbs,
        barCarbs,
        sodiumFrom,
        sodiumRemaining,
        drinkMlph,
        caffeineMgph,
      },
    };
  }

  function computeEventTotals(perHour) {
    const dur = Number(state.planner.durationH);
    const totals = {};
    for (const sku of SKUS_ORDER) {
      const v = Number(perHour[sku] ?? 0) * dur;
      totals[sku] = v > 0 ? ceil(v) : 0;
    }
    return totals;
  }

  function computeBundleTotals(perHour, hoursAdjusted) {
    const totals = {};
    for (const sku of SKUS_ORDER) {
      const v = Number(perHour[sku] ?? 0) * hoursAdjusted;
      totals[sku] = v > 0 ? ceil(v) : 0;
    }
    return totals;
  }

  // ----- Pack selection (mirrors spreadsheet heuristics) -----
  function packsForSku(sku, unitsNeeded) {
    const u = Number(unitsNeeded || 0);
    if (u <= 0) return [];

    // Special cases
    const sixTwelveSkus = new Set(["MIX60", "MIX90", "MIX90_CAFF", "GEL30", "GEL30_CAFF", "BAR50"]);
    if (sixTwelveSkus.has(sku)) {
      const pk6 = pickPackKeyByUnits(sku, 6);
      const pk12 = pickPackKeyByUnits(sku, 12);
      if (!pk12) return [];
      const rem = u % 12;
      const qty12 = Math.floor(u / 12) + (rem > 6 ? 1 : 0);
      const qty6 = rem > 0 && rem <= 6 ? 1 : 0;
      const out = [];
      if (qty12 > 0) out.push({ packKey: pk12, qty: qty12 });
      if (qty6 > 0 && pk6) out.push({ packKey: pk6, qty: qty6 });
      return out;
    }

    if (sku === "MIXPLUS") {
      const pk15 = pickPackKeyByUnits(sku, 15);
      const pk25 = pickPackKeyByUnits(sku, 25);
      if (!pk25) return [];
      const rem = u % 25;
      const qty25 = Math.floor(u / 25) + (rem > 15 ? 1 : 0);
      const qty15 = rem > 0 && rem <= 15 ? 1 : 0;
      const out = [];
      if (qty25 > 0) out.push({ packKey: pk25, qty: qty25 });
      if (qty15 > 0 && pk15) out.push({ packKey: pk15, qty: qty15 });
      return out;
    }

    if (sku === "SLT07_500" || sku === "SLT07_1000") {
      // Packs are 12 / 36 / 72 units
      const pk12 = pickPackKeyByUnits(sku, 12);
      const pk36 = pickPackKeyByUnits(sku, 36);
      const pk72 = pickPackKeyByUnits(sku, 72);
      if (!pk12) return [];

      const qty72 = pk72 ? Math.floor(u / 72) : 0;
      const rem72 = u % 72;
      const qty36 = pk36 ? Math.floor(rem72 / 36) : 0;
      const rem36 = rem72 % 36;
      const qty12 = rem36 > 0 ? Math.ceil(rem36 / 12) : 0;

      const out = [];
      if (qty72 > 0) out.push({ packKey: pk72, qty: qty72 });
      if (qty36 > 0) out.push({ packKey: pk36, qty: qty36 });
      if (qty12 > 0) out.push({ packKey: pk12, qty: qty12 });
      return out;
    }

    if (sku === "SLTPLUS") {
      const pk30 = pickPackKeyByUnits(sku, 30);
      if (!pk30) return [];
      const qty30 = Math.ceil(u / 30);
      return qty30 > 0 ? [{ packKey: pk30, qty: qty30 }] : [];
    }

    // Default: 12-pack only (or smallest available)
    const pk12 = pickPackKeyByUnits(sku, 12);
    if (pk12) {
      const qty12 = Math.ceil(u / 12);
      return qty12 > 0 ? [{ packKey: pk12, qty: qty12 }] : [];
    }

    // Fallback: use the largest pack
    const keys = DATA.packs_by_sku[sku] || [];
    if (keys.length === 0) return [];
    const pk = keys[keys.length - 1];
    const up = Number(getPack(pk).units_per_pack);
    const qty = Math.ceil(u / up);
    return qty > 0 ? [{ packKey: pk, qty }] : [];
  }

  function computeBundlePacks(unitsBySku, applyDiscount) {
    const lines = [];
    let distinct = 0;
    let totalRrp = 0;
    let totalDisc = 0;

    for (const sku of SKUS_ORDER) {
      const unitsNeeded = Number(unitsBySku[sku] ?? 0);
      const packs = packsForSku(sku, unitsNeeded);
      for (const p of packs) {
        const pack = getPack(p.packKey);
        const units = p.qty * Number(pack.units_per_pack);
        const cost = p.qty * Number(pack.rrp_gbp);
        const costDisc = applyDiscount ? cost * (1 - DATA.meta.discount_first_order) : cost;
        if (p.qty > 0) distinct += 1;
        totalRrp += cost;
        totalDisc += costDisc;
        lines.push({
          packKey: p.packKey,
          sku: pack.sku,
          packOption: pack.pack_option,
          qty: p.qty,
          unitsIncluded: units,
          unitsNeeded,
          overshoot: units - unitsNeeded,
          rrp: cost,
          discounted: costDisc,
          url: pack.url,
        });
      }
    }

    return {
      lines,
      distinctItems: distinct,
      totalRrp,
      totalDiscounted: totalDisc,
      meetsMin: distinct >= DATA.meta.bundle_min_distinct_items,
    };
  }

  // ----- Bundle Builder prefill + checkout bridge -----
  function buildByobPrefillUrl(bundle) {
    // Minimal payload: packKey + qty. You can extend this with flavour preferences, etc.
    const payload = {
      v: 1,
      generatedAt: new Date().toISOString(),
      planner: {
        activity: state.planner.activity,
        durationH: state.planner.durationH,
        rpe: state.planner.rpe,
        conditions: state.planner.conditions,
        planStyle: state.planner.planStyle,
        carbMode: state.planner.carbMode,
        caffeineProtocol: state.planner.caffeineProtocol,
      },
      lines: bundle.lines.map((l) => ({ packKey: l.packKey, qty: l.qty })),
    };

    const encoded = base64UrlEncode(JSON.stringify(payload));
    return `https://styrkr.com/products/build-your-own-bundle?prefill=${encodeURIComponent(encoded)}`;
  }

  function setPrefillCtas(bundle, elOpen, elCopy, elNote) {
    if (!elOpen) return;
    const url = bundle.lines.length ? buildByobPrefillUrl(bundle) : "https://styrkr.com/products/build-your-own-bundle";
    elOpen.href = url;

    if (elCopy) {
      elCopy.onclick = async () => {
        try {
          await toClipboard(url);
          if (elNote) {
            elNote.style.display = "block";
            elNote.textContent = "Prefill link copied.";
          }
        } catch (e) {
          if (elNote) {
            elNote.style.display = "block";
            elNote.textContent = "Copy failed (browser blocked clipboard).";
          }
        }
      };
    }
  }

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

    if (noteEl) {
      noteEl.style.display = "block";
      noteEl.textContent = "Building cart…";
    }

    // Resolve variant IDs from pack URLs
    async function fetchJson(url) {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }

    function parseHandleFromUrl(url, segment) {
      const parts = url.split(`/${segment}/`);
      if (parts.length < 2) return null;
      const tail = parts[1].split(/[?#]/)[0];
      return tail.split("/")[0];
    }

    async function resolveVariantId(packKey, packOption, url) {
      // 1) Direct product URL => /products/<handle>.js
      if (url.includes("/products/")) {
        const handle = parseHandleFromUrl(url, "products");
        if (!handle) return null;
        const product = await fetchJson(`/products/${handle}.js`);
        const variants = product.variants || [];
        if (!variants.length) return null;
        const needle = String(packOption || "").toLowerCase();
        const v =
          variants.find((x) => String(x.title || "").toLowerCase().includes(needle)) ||
          variants.find((x) => String(x.option1 || "").toLowerCase().includes(needle)) ||
          variants[0];
        return v.id;
      }

      // 2) Collection URL => pick first product, then match variant by pack option
      if (url.includes("/collections/")) {
        const col = parseHandleFromUrl(url, "collections");
        if (!col) return null;
        const data = await fetchJson(`/collections/${col}/products.json?limit=250`);
        const products = data.products || [];
        if (!products.length) return null;

        // Heuristic: choose a sensible default product where possible
        let product = products[0];
        const key = String(packKey || "");
        if (key.startsWith("MIXPLUS")) {
          const pref = products.find((p) => String(p.handle || "").includes("byob-mix-blood-orange")) || products[0];
          product = pref;
        }
        if (key.startsWith("BAR50")) {
          const pref = products.find((p) => String(p.title || "").toLowerCase().includes("variety")) || products[0];
          product = pref;
        }

        const variants = product.variants || [];
        if (!variants.length) return null;
        const needle = String(packOption || "").toLowerCase();
        const v = variants.find((x) => String(x.title || "").toLowerCase().includes(needle)) || variants[0];
        return v.id;
      }

      return null;
    }

    const items = [];
    for (const line of bundle.lines) {
      if (!line.qty || line.qty <= 0) continue;
      const pack = getPack(line.packKey);
      const variantId = await resolveVariantId(line.packKey, pack.pack_option, line.url);
      if (!variantId) {
        console.warn("Could not resolve variant for", line.packKey, line.url);
        continue;
      }
      items.push({ id: variantId, quantity: line.qty });
    }

    if (!items.length) {
      if (noteEl) noteEl.textContent = "Could not resolve any pack variants to add. (Check BYOB URLs / variants.)";
      return;
    }

    const res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items }),
    });

    if (!res.ok) {
      if (noteEl) noteEl.textContent = "Add to cart failed. Check console for details.";
      return;
    }

    if (noteEl) noteEl.textContent = "Added to cart. Redirecting…";
    window.location.href = "/cart";
  }


// ----- Rendering -----
  function renderSummary(targets, plan, totals) {
    const dur = Number(state.planner.durationH);
    const totalCarbs = targets.carbTargetGph * dur;
    const totalFluidL = (targets.fluidTargetMlph * dur) / 1000;
    const totalSodium = targets.sodiumTargetMgph * dur;

    const totalCaff = Math.round(plan.debug.caffeineMgph * dur);

    const cards = [
      {
        k: "Carbs",
        v: `${fmt(targets.carbTargetGph, 0)} <small>g/h</small>`,
        n: `Total: ${fmt(totalCarbs, 0)} g · Mode cap: ${fmt(targets.carbCap, 0)} g/h`,
      },
      {
        k: "Fluids",
        v: `${fmt(targets.fluidTargetMlph, 0)} <small>ml/h</small>`,
        n: `Total: ${fmt(totalFluidL, 1)} L · Bottles/h: ${fmt(targets.fluidTargetMlph / Number(state.planner.bottleSizeMl || 750), 2)} · Band: ${targets.band}`,
      },
      {
        k: "Sodium",
        v: `${fmt(targets.sodiumTargetMgph, 0)} <small>mg/h</small>`,
        n: `Sweat: ${fmt(targets.sweatNaMgL, 0)} mg/L · Replace: ${fmt(state.planner.sodiumRepl, 2)}`,
      },
      {
        k: "Caffeine",
        v: `${fmt(totalCaff, 0)} <small>mg</small>`,
        n: `Protocol: ${state.planner.caffeineProtocol}${state.planner.caffeineProtocol === "Custom" ? ` (${fmt(targets.caffFrac, 2)})` : ""}`,
      },
    ];

    const wrap = $("summaryCards");
    wrap.innerHTML = cards
      .map(
        (c) => `
        <div class="cardMini">
          <div class="k">${c.k}</div>
          <div class="v">${c.v}</div>
          <div class="n">${c.n}</div>
        </div>`
      )
      .join("");
  }

  function renderProductPlan(targets, plan, totals) {
    const perHour = plan.perHour;
    const dur = Number(state.planner.durationH);

    const rows = [];
    let carbsPerH = 0;
    let sodiumPerH = 0;
    let caffeinePerH = 0;

    for (const sku of SKUS_ORDER) {
      const rate = Number(perHour[sku] ?? 0);
      const total = Number(totals[sku] ?? 0);
      if (rate <= 0 && total <= 0) continue;

      const prod = getProduct(sku);
      const c = rate * Number(prod.carbs_g);
      const na = rate * Number(prod.sodium_mg);
      const caf = rate * Number(prod.caffeine_mg);

      carbsPerH += c;
      sodiumPerH += na;
      caffeinePerH += caf;

      const name = prod.name || sku;
      const short = sku.replace("_", " ");
      rows.push({
        sku,
        name,
        short,
        rate,
        total,
        c,
        na,
        caf,
        url: prod.url,
      });
    }

    const eventCarbs = carbsPerH * dur;
    const eventSodium = sodiumPerH * dur;
    const eventCaff = caffeinePerH * dur;

    const table = `
      <table class="table">
        <thead>
          <tr>
            <th>Product</th>
            <th class="num">/h</th>
            <th class="num">Total</th>
            <th class="num">Carbs</th>
            <th class="num">Sodium</th>
            <th class="num">Caff</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>
                <div style="font-weight:700; letter-spacing:0.02em;">
                  <a href="${r.url}" target="_blank" rel="noreferrer">${r.short}</a>
                </div>
                <div class="mutedCell">${r.name}</div>
              </td>
              <td class="num">${fmt(r.rate, 2)}</td>
              <td class="num">${fmt(r.total, 0)}</td>
              <td class="num">${fmt(r.c, 0)}<span class="mutedCell"> g/h</span></td>
              <td class="num">${fmt(r.na, 0)}<span class="mutedCell"> mg/h</span></td>
              <td class="num">${fmt(r.caf, 0)}<span class="mutedCell"> mg/h</span></td>
            </tr>`
            )
            .join("")}
          <tr>
            <td style="font-weight:700;">Totals (per hour)</td>
            <td class="num">—</td>
            <td class="num">—</td>
            <td class="num">${fmt(carbsPerH, 0)}<span class="mutedCell"> g/h</span></td>
            <td class="num">${fmt(sodiumPerH, 0)}<span class="mutedCell"> mg/h</span></td>
            <td class="num">${fmt(caffeinePerH, 0)}<span class="mutedCell"> mg/h</span></td>
          </tr>
        </tbody>
      </table>
    `;

    $("productPlan").innerHTML = table;

    // Notes about fluids vs mixed drink volume
    const drinkMlph = plan.debug.drinkMlph;
    const extraWater = targets.fluidTargetMlph - drinkMlph;

    const notes = [];
    notes.push(`<strong>Drink volume:</strong> plan mixes ~${fmt(drinkMlph, 0)} ml/h. Fluid target is ${fmt(targets.fluidTargetMlph, 0)} ml/h.`);
notes.push(`<strong>From products:</strong> ~${fmt(carbsPerH,0)} g/h carbs · ${fmt(sodiumPerH,0)} mg/h sodium · ${fmt(caffeinePerH,0)} mg/h caffeine.`);
    notes.push(`<strong>Over ${fmt(dur,2)} h:</strong> ~${fmt(eventCarbs,0)} g carbs · ${fmt(eventSodium,0)} mg sodium · ${fmt(eventCaff,0)} mg caffeine.`);

    if (extraWater > 150) {
      notes.push(`Top up with ~${fmt(extraWater, 0)} ml/h plain water (or dilute / sip more).`);
    } else if (extraWater < -150) {
      notes.push(`Your mix volume exceeds the fluid target by ~${fmt(Math.abs(extraWater), 0)} ml/h. Consider concentrating mixes or shifting carbs to gels/bars.`);
    } else {
      notes.push(`Drink volume is close to target (±150 ml/h).`);
    }

    const node = $("productNotes");
    node.style.display = "block";
    node.innerHTML = notes.join("<br />");
  }

  function renderBundle30Summary(targets, perHourPlan) {
    const sessions = Number(state.bundle.sessions30d);
    const avgH = Number(state.bundle.avgSessionH);
    const pct = Number(state.bundle.fuelledPct);

    const hours = sessions * avgH;
    const hoursAdj = hours * pct;

    const out = `
      <div class="notice">
        <strong>Fuelled hours:</strong> ${fmt(hours, 2)} h / 30d<br/>
        <strong>Adjusted (×${fmt(pct, 2)}):</strong> ${fmt(hoursAdj, 2)} h<br/>
        <strong>Targets used:</strong> ${fmt(targets.carbTargetGph, 0)} g/h carbs · ${fmt(targets.sodiumTargetMgph, 0)} mg/h sodium · ${state.planner.planStyle}
      </div>
    `;
    $("bundle30Out").innerHTML = out;
    return hoursAdj;
  }

  function renderBundle30Packs(bundle, unitsBySku, applyDiscount) {
    if (!bundle.lines.length) {
      $("bundle30Packs").innerHTML = `<div class="muted">No packs required for the current settings.</div>`;
      return;
    }

    // ----- Per-unit drop frames (Mix / Gels / Bars / SLT)
    const GROUPS = [
      { key: "mix", label: "Mix", unit: "servings", skus: ["MIXPLUS", "MIX60", "MIX90", "MIX90_CAFF"] },
      { key: "gel", label: "Gels", unit: "gels", skus: ["GEL30", "GEL30_CAFF", "GEL50"] },
      { key: "bar", label: "Bars", unit: "bars", skus: ["BAR30", "BAR50"] },
      { key: "slt", label: "SLT", unit: "tabs", skus: ["SLT07_500", "SLT07_1000", "SLTPLUS"] },
    ];

    function sumBySku(list, getter) {
      let s = 0;
      for (const sku of list) s += Number(getter(sku) || 0);
      return s;
    }

    function sumLines(list, getter) {
      let s = 0;
      for (const l of bundle.lines) {
        if (!list.includes(l.sku)) continue;
        s += Number(getter(l) || 0);
      }
      return s;
    }

    const cards = GROUPS.map((g) => {
      const need = sumBySku(g.skus, (sku) => unitsBySku?.[sku]);
      if (need <= 0) return "";

      const unitsIncluded = sumLines(g.skus, (l) => l.unitsIncluded);
      const costRrp = sumLines(g.skus, (l) => l.rrp);
      const costDisc = sumLines(g.skus, (l) => l.discounted);
      const unitRrp = unitsIncluded > 0 ? costRrp / unitsIncluded : 0;
      const unitDisc = unitsIncluded > 0 ? costDisc / unitsIncluded : 0;
      const overshoot = unitsIncluded - need;

      return `
        <div class="dropCard">
          <div class="dropCard__k">${g.label}</div>
          <div class="dropCard__v">${fmt(need, 0)} <span class="muted">${g.unit}</span></div>
          <div class="dropCard__meta">
            Order ${fmt(unitsIncluded, 0)} · £${fmt(unitRrp, 2)}/${g.unit.slice(0, -1) || "unit"}
            ${overshoot > 0 ? `<span class="muted"> · +${fmt(overshoot, 0)} spare</span>` : ""}
          </div>
          <div class="dropCard__price">
            <span>£${fmt(costRrp, 2)} RRP</span>
            ${applyDiscount ? `<span class="muted"> · £${fmt(costDisc, 2)} sub</span>` : ""}
          </div>
        </div>
      `;
    })
      .filter(Boolean)
      .join("");

    const drops = cards
      ? `
      <div class="dropGrid">${cards}</div>
      <div class="muted" style="margin-top: var(--s-3);">Per‑unit pricing is derived from the packs below. Pack selection rounds up to whole packs.</div>
    `
      : "";

    const rows = bundle.lines.map((l) => {
      const pack = getPack(l.packKey);
      const unit = Number(pack.rrp_gbp) / Number(pack.units_per_pack);
      return `
        <tr>
          <td>
            <div style="font-weight:700;">
              <a href="${l.url}" target="_blank" rel="noreferrer">${l.packKey}</a>
            </div>
            <div class="mutedCell">${pack.pack_option} · ${l.sku}</div>
          </td>
          <td class="num">${fmt(l.qty, 0)}</td>
          <td class="num">${fmt(l.unitsIncluded, 0)}</td>
          <td class="num">£${fmt(unit, 2)}</td>
          <td class="num">£${fmt(l.rrp, 2)}</td>
          <td class="num">${applyDiscount ? `£${fmt(l.discounted, 2)}` : "—"}</td>
        </tr>`;
    });

    const table = `
      <table class="table">
        <thead>
          <tr>
            <th>Pack</th>
            <th class="num">Qty</th>
            <th class="num">Units</th>
            <th class="num">£/unit</th>
            <th class="num">RRP</th>
            <th class="num">${applyDiscount ? "Sub (‑25%)" : "Sub"}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("")}
          <tr>
            <td style="font-weight:700;">Total (30d)</td>
            <td class="num">${fmt(bundle.distinctItems, 0)}<span class="mutedCell"> items</span></td>
            <td class="num">—</td>
            <td class="num">—</td>
            <td class="num">£${fmt(bundle.totalRrp, 2)}</td>
            <td class="num">${applyDiscount ? `£${fmt(bundle.totalDiscounted, 2)}` : "—"}</td>
          </tr>
        </tbody>
      </table>
    `;

    $("bundle30Packs").innerHTML = drops + table;

    const noteEl = $("bundle30Notes");
    const notes = [];
    if (!bundle.meetsMin) {
      notes.push(`<strong>BYOB rule:</strong> this list has ${bundle.distinctItems} item types. Minimum is ${DATA.meta.bundle_min_distinct_items}.`);
      notes.push(`Try a more varied plan style (Balanced / Adventure-led) to increase item count.`);
      noteEl.classList.add("notice--warn");
    } else {
      noteEl.classList.remove("notice--warn");
      notes.push(`<strong>BYOB rule:</strong> meets the ${DATA.meta.bundle_min_distinct_items} item minimum.`);
    }

    noteEl.style.display = "block";
    noteEl.innerHTML = notes.join("<br />");
  }

  // ----- UI Wiring -----
  function setView(view) {
    // Lock non-planner tabs until lead capture is complete
    let nextView = view;
    if (!state.lead.unlocked && nextView !== "planner") {
      nextView = "planner";
      setStep(4);
    }

    state.view = nextView;
    document.querySelectorAll(".nav__btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.view === nextView);
      b.setAttribute("aria-selected", b.dataset.view === nextView ? "true" : "false");
    });
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${nextView}`));
    applyLockState();
    render(); // keep outputs fresh
  }

  function applyLockState() {
    const locked = !state.lead.unlocked;

    // Right-panel blur overlay
    const lock = $("planLock");
    if (lock) lock.classList.toggle("is-locked", locked);

    const overlay = $("planLockOverlay");
    if (overlay) overlay.setAttribute("aria-hidden", locked ? "false" : "true");

    // Tabs
    document.querySelectorAll(".nav__btn").forEach((b) => {
      const v = String(b.dataset.view || "");
      const shouldDisable = locked && v !== "planner";
      b.disabled = shouldDisable;
      b.title = shouldDisable ? "Unlock the plan in Step 5 to access this tab." : "";
    });

    // Keep CTA copy consistent
    setStep(state.step);
  }

  function attemptUnlock() {
    const nameEl = $("leadName");
    const emailEl = $("leadEmail");
    const errEl = $("leadError");

    const name = nameEl ? nameEl.value : state.lead.name;
    const email = emailEl ? emailEl.value : state.lead.email;
    const v = validateLeadInputs(name, email);

    if (!v.ok) {
      if (errEl) {
        errEl.style.display = "block";
        errEl.textContent = v.message;
      }
      return false;
    }

    if (errEl) {
      errEl.style.display = "none";
      errEl.textContent = "";
    }

    state.lead.name = String(name || "").trim();
    state.lead.email = String(email || "").trim();
    state.lead.unlocked = true;
    state.lead.capturedAt = new Date().toISOString();
    saveLead();

    // Analytics / integration hook (no-op unless listened for)
    try {
      window.dispatchEvent(
        new CustomEvent("styrkr_fueltool_lead_capture", {
          detail: {
            name: state.lead.name,
            email: state.lead.email,
            capturedAt: state.lead.capturedAt,
            localMode: isLocalMode(),
          },
        })
      );
    } catch (_) {}

    applyLockState();
    return true;
  }

  function setStep(step) {
    state.step = clamp(step, 0, 4);
    document.querySelectorAll(".step").forEach((b) => b.classList.toggle("is-active", Number(b.dataset.step) === state.step));
    document.querySelectorAll(".stepPane").forEach((p) => p.classList.toggle("is-active", Number(p.dataset.step) === state.step));

    $("prevBtn").style.visibility = state.step === 0 ? "hidden" : "visible";
    if (state.step === 4) {
      $("nextBtn").textContent = state.lead.unlocked ? "Done" : "Unlock plan";
    } else {
      $("nextBtn").textContent = "Next";
    }
  }

  function wirePlannerInputs() {
    // Populate selects
    const activitySel = $("activity");
    activitySel.innerHTML = Object.keys(DATA.rules.activity_multiplier)
      .map((k) => `<option value="${k}">${k}</option>`)
      .join("");

    const condSel = $("conditions");
    condSel.innerHTML = Object.keys(DATA.rules.conditions_fluid_adj_mlph)
      .map((k) => `<option value="${k}">${k}</option>`)
      .join("");

    const bottleSel = $("bottleSizeMl");
    const bottleOptions = [250, 330, 500, 600, 750, 1000];
    if (bottleSel) {
      bottleSel.innerHTML = bottleOptions.map((v) => `<option value="${v}">${v} ml</option>`).join("");
    }

    const sweatSel = $("sweatRate");
    sweatSel.innerHTML = Object.keys(DATA.rules.sweat_rate_mlph)
      .map((k) => `<option value="${k}">${k}</option>`)
      .join("");

    const saltSel = $("sweatSalt");
    saltSel.innerHTML = Object.keys(DATA.rules.sweat_sodium_mgL)
      .map((k) => `<option value="${k}">${k}</option>`)
      .join("");

    const carbModeSel = $("carbMode");
    carbModeSel.innerHTML = Object.keys(DATA.rules.carb_mode_caps)
      .map((k) => `<option value="${k}">${k}</option>`)
      .join("");

    const cafSel = $("caffeineProtocol");
    const cafOptions = [...Object.keys(DATA.rules.caffeine_fraction), "Custom"];
    cafSel.innerHTML = cafOptions.map((k) => `<option value="${k}">${k}</option>`).join("");

    // Plan style cards
    const grid = $("planStyleGrid");
    const styles = Object.entries(DATA.rules.plan_styles);
    grid.innerHTML = styles
      .map(([k, v]) => {
        const meta = [
          `${Math.round(v.drink_share * 100)}% drinks`,
          `${Math.round(v.gel_share * 100)}% gels`,
          `${Math.round(v.bar_share * 100)}% bars`,
        ];
        return `
          <div class="choice" data-style="${k}" tabindex="0" role="button" aria-label="Select ${k}">
            <div class="choice__title">${k}</div>
            <div class="choice__desc">${v.description}</div>
            <div class="choice__meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>
          </div>
        `;
      })
      .join("");

    // Defaults
    activitySel.value = state.planner.activity;
    $("durationH").value = state.planner.durationH;
    $("rpe").value = state.planner.rpe;
    $("rpeVal").textContent = fmt(state.planner.rpe, 1);
    condSel.value = state.planner.conditions;
    if (bottleSel) bottleSel.value = String(state.planner.bottleSizeMl || 750);
    sweatSel.value = state.planner.sweatRate;
    saltSel.value = state.planner.sweatSalt;
    carbModeSel.value = state.planner.carbMode;
    cafSel.value = state.planner.caffeineProtocol;
    $("sodiumRepl").value = state.planner.sodiumRepl;
    $("sodiumReplVal").textContent = fmt(state.planner.sodiumRepl, 2);

    // Select plan style card
    function markStyle() {
      document.querySelectorAll(".choice").forEach((c) => c.classList.toggle("is-selected", c.dataset.style === state.planner.planStyle));
    }
    markStyle();

    // Listeners
    activitySel.addEventListener("change", (e) => {
      state.planner.activity = e.target.value;
      render();
    });

    $("durationH").addEventListener("input", (e) => {
      state.planner.durationH = clamp(Number(e.target.value || 0), 0.25, 48);
      render();
    });

    $("rpe").addEventListener("input", (e) => {
      state.planner.rpe = Number(e.target.value || 5);
      $("rpeVal").textContent = fmt(state.planner.rpe, 1);
      render();
    });

    condSel.addEventListener("change", (e) => {
      state.planner.conditions = e.target.value;
      render();
    });

    if (bottleSel) {
      bottleSel.addEventListener("change", (e) => {
        state.planner.bottleSizeMl = clamp(Number(e.target.value || 750), 200, 2000);
        render();
      });
    }

    sweatSel.addEventListener("change", (e) => {
      state.planner.sweatRate = e.target.value;
      render();
    });

    saltSel.addEventListener("change", (e) => {
      state.planner.sweatSalt = e.target.value;
      render();
    });

    $("sodiumRepl").addEventListener("input", (e) => {
      state.planner.sodiumRepl = Number(e.target.value || 0.5);
      $("sodiumReplVal").textContent = fmt(state.planner.sodiumRepl, 2);
      render();
    });

    carbModeSel.addEventListener("change", (e) => {
      state.planner.carbMode = e.target.value;
      render();
    });

    cafSel.addEventListener("change", (e) => {
      state.planner.caffeineProtocol = e.target.value;
      const show = state.planner.caffeineProtocol === "Custom";
      $("caffeineCustomWrap").style.display = show ? "block" : "none";
      render();
    });

    $("caffeineCustom").addEventListener("input", (e) => {
      state.planner.caffeineCustom = Number(e.target.value || 0);
      $("caffeineCustomVal").textContent = fmt(state.planner.caffeineCustom, 2);
      render();
    });

    // Style card selection
    grid.addEventListener("click", (e) => {
      const card = e.target.closest(".choice");
      if (!card) return;
      state.planner.planStyle = card.dataset.style;
      markStyle();
      render();
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest(".choice");
      if (!card) return;
      state.planner.planStyle = card.dataset.style;
      markStyle();
      render();
    });

    // Stepper
    document.querySelectorAll(".step").forEach((b) => {
      b.addEventListener("click", () => setStep(Number(b.dataset.step)));
    });
    $("prevBtn").addEventListener("click", () => setStep(state.step - 1));

    $("nextBtn").addEventListener("click", () => {
      if (state.step < 4) {
        setStep(state.step + 1);
        return;
      }

      // Step 5: lead capture + unlock
      if (!state.lead.unlocked) {
        const ok = attemptUnlock();
        if (ok) {
          // After unlock, return the user to the Output step so the plan is immediately readable.
          setView("planner");
          setStep(3);
        }
        return;
      }

      // Already unlocked: treat "Done" as a forward action (bundle next)
      setView("bundle");
    });

    // Ensure custom caffeine UI reflects default
    $("caffeineCustomVal").textContent = fmt(state.planner.caffeineCustom, 2);
    $("caffeineCustomWrap").style.display = state.planner.caffeineProtocol === "Custom" ? "block" : "none";

    // Lead capture defaults
    const leadName = $("leadName");
    const leadEmail = $("leadEmail");
    if (leadName) leadName.value = state.lead.name || "";
    if (leadEmail) leadEmail.value = state.lead.email || "";

    // Keep state in sync (even before unlock)
    if (leadName) {
      leadName.addEventListener("input", (e) => {
        state.lead.name = String(e.target.value || "");
      });
    }
    if (leadEmail) {
      leadEmail.addEventListener("input", (e) => {
        state.lead.email = String(e.target.value || "");
      });
    }

    // Plan lock overlay CTA
    const go = $("goToDetailsBtn");
    if (go) {
      go.addEventListener("click", () => {
        setView("planner");
        setStep(4);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  function wireBundleInputs() {
    const sess = $("sessions30d");
    const avg = $("avgSessionH");
    const pct = $("fuelledPct");
    const pctVal = $("fuelledPctVal");
    const disc = $("bundleDiscount");

    sess.value = state.bundle.sessions30d;
    avg.value = state.bundle.avgSessionH;
    pct.value = state.bundle.fuelledPct;
    pctVal.textContent = fmt(state.bundle.fuelledPct, 2);
    disc.checked = state.bundle.applyDiscount;

    sess.addEventListener("input", (e) => {
      state.bundle.sessions30d = clamp(Number(e.target.value || 0), 0, 60);
      render();
    });
    avg.addEventListener("input", (e) => {
      state.bundle.avgSessionH = clamp(Number(e.target.value || 0), 0.25, 12);
      render();
    });
    pct.addEventListener("input", (e) => {
      state.bundle.fuelledPct = clamp(Number(e.target.value || 0), 0, 1);
      pctVal.textContent = fmt(state.bundle.fuelledPct, 2);
      render();
    });
    disc.addEventListener("change", (e) => {
      state.bundle.applyDiscount = !!e.target.checked;
      render();
    });
  }

  function wireNav() {
    document.querySelectorAll(".nav__btn").forEach((b) => {
      b.addEventListener("click", () => setView(b.dataset.view));
    });
  }

  function wireTheme() {
    const btn = $("themeToggle");
    btn.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("theme-light");
      btn.textContent = isLight ? "Dark mode" : "Light mode";
    });
  }

  // ----- Main render -----
  function render() {
    const targets = computeTargets();
    const plan = computePlanPerHour(targets);
    const totals = computeEventTotals(plan.perHour);

    renderSummary(targets, plan, totals);
    renderProductPlan(targets, plan, totals);

    // Bundle Builder view (30d)
    const hoursAdj = renderBundle30Summary(targets, plan);
    const monthlyTotals = computeBundleTotals(plan.perHour, hoursAdj);
    const bundle30 = computeBundlePacks(monthlyTotals, state.bundle.applyDiscount);
    renderBundle30Packs(bundle30, monthlyTotals, state.bundle.applyDiscount);

    // Prefill CTA (30-day)
    setPrefillCtas(bundle30, $("openPrefillByobBtn30"), null, $("bundle30CtaNote"));

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
  }

  // ----- Init -----
  function init() {
    loadLead();
    wireNav();
    wireTheme();
    wirePlannerInputs();
    wireBundleInputs();
    setStep(0);
    applyLockState();
    render();
  }

  init();
})();
