// sidebar.js — Economy + Military (draft-aware), annualized UI for flows
// Fixed & hardened: null-guards, safer state init, consistent annualization, robust tab/time wiring.
// Public surface preserved: export { updateClockDisplay, startGame }, window.advanceEconomy, window.updateEconomy.

import { state } from "./state.js";
import {
  pauseTimer,
  startTimer,
  setTimeScale,
  resetSimulationDate,
  simulationDate,
} from "./timer.js";
import { formatCompactNumber } from "./utilities.js";

/* ============================= Globals ============================= */
let econ = null; // live economic/military state (for UI + sim)

/* ============================== Utils ============================== */
const DAYS_IN_YEAR = 365;

function byId(id) {
  return /** @type {HTMLElement|null} */ (document.getElementById(id));
}
function assertEl(id) {
  const el = byId(id);
  if (!el) console.warn(`[sidebar] Missing element #${id}`);
  return el;
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function safeNumber(n, fallback = 0) {
  return Number.isFinite(+n) ? +n : fallback;
}

/* ============================== Clock ============================== */
export function updateClockDisplay() {
  const el = byId("sim-clock");
  if (!el || !simulationDate) return;
  try {
    el.textContent = simulationDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    // fallback to ISO if locale fails for any reason
    el.textContent = String(simulationDate).slice(0, 10);
  }
}

/* ============================ Sidebar UI =========================== */
export function buildGameSidebar() {
  const sidebar = byId("sidebar");
  if (!sidebar) {
    console.warn("[sidebar] #sidebar not found, aborting sidebar build.");
    return;
  }

  sidebar.innerHTML = `
<div id="drag-handle"></div>

<!-- Settings + Time -->
<div class="box" id="box-settings">
  <button id="settings-btn-sidebar" class="time-btn">Settings</button>
  <div id="time-box">
    <div id="time-date">Date: <span id="sim-clock" class="toolbar-date">—</span></div>
    <div id="time-controls">
      <button data-speed="0" class="time-btn" title="Pause">❚❚</button>
      <button data-speed="1" class="time-btn" title="1× speed">1×</button>
      <button data-speed="3" class="time-btn" title="3× speed">3×</button>
      <button data-speed="10" class="time-btn" title="10× speed">10×</button>
    </div>
  </div>
</div>

<!-- Header -->
<div class="box" id="box-header">
  <h2 id="in-game-header"></h2>
</div>

<!-- Tabs -->
<div class="box" id="box-modes">
  <button id="mode-diplomacy" class="mode-btn active">Diplomacy</button>
  <button id="mode-economy" class="mode-btn">Economy</button>
  <button id="mode-military" class="mode-btn">Military</button>
</div>

<!-- Content -->
<div class="box" id="box-content">
  <div id="content-diplomacy" class="content-page"></div>
  <div id="content-economy" class="content-page" style="display:none"></div>
  <div id="content-military" class="content-page" style="display:none"></div>
</div>
`;

  // Header: country name (guard all state paths)
  try {
    const pid = state?.gameState?.playerCountryId;
    const cname = state?.countryData?.[pid]?.name ?? "—";
    const headerEl = byId("in-game-header");
    if (headerEl) headerEl.textContent = cname;
  } catch (e) {
    console.warn("[sidebar] Could not resolve player country name:", e);
  }

  // Settings open
  byId("settings-btn-sidebar")?.addEventListener("click", () => {
    byId("settings-modal")?.classList.remove("hidden");
  });

  // Time controls
  const timeButtons = sidebar.querySelectorAll("#time-controls button");
  timeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const speed = Number(btn.getAttribute("data-speed"));
      if (speed === 0) {
        pauseTimer();
      } else {
        setTimeScale(speed);
        startTimer();
      }
      timeButtons.forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  // Tabs
  const modes = ["diplomacy", "economy", "military"];
  modes.forEach((mode) => {
    const tab = byId(`mode-${mode}`);
    tab?.addEventListener("click", () => {
      modes.forEach((m) => {
        const btn = byId(`mode-${m}`);
        const page = byId(`content-${m}`);
        if (btn) btn.classList.toggle("active", m === mode);
        if (page) page.style.display = m === mode ? "block" : "none";
      });
    });
  });

  // Pages
  buildDiplomacy();
  buildEconomy();   // seeds econ via initEconomyLogic()
  buildMilitary();  // safe to read econ now

  updateClockDisplay();
}

/* ========================= Page: Diplomacy ========================= */
function buildDiplomacy() {
  const el = assertEl("content-diplomacy");
  if (!el) return;
  el.innerHTML = `<p>Select a country to view diplomacy information.</p>`;
}

/* ========================== Page: Economy ========================== */
function buildEconomy() {
  const el = assertEl("content-economy");
  if (!el) return;

  el.innerHTML = `
<div class="econ-grid">
  <!-- Stability -->
  <div class="econ-card">
    <div class="card-header">Stability</div>
    <div class="card-value"><span id="stab-value">—%</span></div>
    <div class="card-growth" title="Annual change"><span id="stab-growth">—% /yr</span></div>
  </div>

  <!-- GDP -->
  <div class="econ-card">
    <div class="card-header">GDP</div>
    <div class="card-value">$<span id="econ-gdp-total">—</span></div>
    <div class="card-growth" title="Annual change"><span id="econ-gdp-growth">—% /yr</span></div>
  </div>

  <!-- Population -->
  <div class="econ-card">
    <div class="card-header">Population</div>
    <div class="card-value"><span id="econ-population">—</span></div>
    <div class="card-growth" title="Annual change"><span id="econ-pop-growth">—% /yr</span></div>
  </div>

  <!-- Labour Force (civilian) -->
  <div class="econ-card">
    <div class="card-header">Labour Force</div>
    <div class="card-value"><span id="econ-labour-force">—</span></div>
    <div class="card-growth" title="Annual change"><span id="econ-labour-growth">—% /yr</span></div>
  </div>

  <!-- Productivity -->
  <div class="econ-card">
    <div class="card-header">Productivity</div>
    <div class="card-value"><span id="econ-labour-productivity">—</span></div>
    <div class="card-growth" title="Annual change"><span id="econ-prod-growth">—% /yr</span></div>
  </div>

  <!-- Treasury + Annual Gov Revenue -->
  <div class="econ-card">
    <div class="card-header">Treasury</div>
    <div class="card-value">$<span id="econ-treasury-total">—</span></div>
    <div class="card-growth" title="Government revenue per year">
      +$<span id="econ-gov-revenue">—</span>/yr
    </div>
  </div>
</div>

<div class="econ-sliders">
  <div class="econ-card slider-card">
    <div class="card-header"><span>Tax &amp; C/I</span></div>

    <div class="slider-group">
      <label>Tax Rate: <span id="tax-rate-display">—%</span></label>
      <input type="range" id="tax-slider" min="0" max="100" step="1" value="30" />
      <div class="slider-info">
        <small>Stab: <span id="tax-stability-effect">—% /yr</span></small>
        <small>Rev: <span id="tax-revenue-effect">—</span>/yr</small>
      </div>
    </div>

    <div class="slider-group">
      <label>Consumption: <span id="consumption-display">—%</span></label>
      <input id="consumption-slider" type="range" min="0" max="100" step="1" value="35" />
      <div class="slider-info">
        <small>Pop Δ: <span id="ci-pop-effect">—% /yr</span></small>
      </div>
    </div>

    <div class="slider-group">
      <label>Investment: <span id="investment-display">—%</span></label>
      <input id="investment-slider" type="range" min="0" max="100" step="1" value="35" />
      <div class="slider-info">
        <small>Prod Δ: <span id="ci-prod-effect">—% /yr</span></small>
      </div>
    </div>
  </div>
</div>
`;
  initEconomyLogic();
}

/* ========================= Page: Military ========================= */
function buildMilitary() {
  const el = assertEl("content-military");
  if (!el) return;

  el.innerHTML = `
<div class="econ-grid">
  <div class="econ-card">
    <div class="card-header">Treasury</div>
    <div class="card-value">$<span id="mil-treasury">—</span></div>
  </div>

  <div class="econ-card">
    <div class="card-header">Annual Income</div>
    <div class="card-value">$<span id="mil-daily-income">—</span>/yr</div>
  </div>

  <div class="econ-card">
    <div class="card-header">Military Power</div>
    <div class="card-value"><span id="mil-power">—</span></div>
    <div class="card-growth" title="Net yearly change"><span id="mil-power-delta">—/yr</span></div>
  </div>

  <div class="econ-card">
    <div class="card-header">Readiness</div>
    <div class="card-value"><span id="mil-readiness">—%</span></div>
    <div class="card-growth" title="Trend"><span id="mil-readiness-trend">—/yr</span></div>
  </div>

  <div class="econ-card">
    <div class="card-header">Upkeep</div>
    <div class="card-value">$<span id="mil-upkeep">—</span>/yr</div>
    <div class="card-growth" title="Upkeep coverage">
      Paid: $<span id="mil-upkeep-paid">—</span> / Req: $<span id="mil-upkeep-req">—</span>
    </div>
  </div>

  <div class="econ-card">
    <div class="card-header">Net Change</div>
    <div class="card-value">$<span id="mil-net">—</span>/yr</div>
  </div>

  <div class="econ-card">
    <div class="card-header">Troop Power</div>
    <div class="card-value"><span id="mil-troop-power">—</span></div>
  </div>

  <div class="econ-card">
    <div class="card-header">Equipment Power</div>
    <div class="card-value"><span id="mil-equip-power">—</span></div>
  </div>
</div>

<div class="econ-card slider-card">
  <div class="card-header"><span>Defense Budget</span></div>
  <div class="slider-group">
    <label>Defense Budget: <span id="defense-budget-display">—%</span> of revenue</label>
    <input id="defense-budget-slider" type="range" min="0" max="100" step="1" value="10" />
    <div class="slider-info">
      <small>Planned Spend/yr: $<span id="defense-planned-spend">—</span></small>
    </div>
  </div>

  <div class="slider-group">
    <label>Military Service: <span id="draft-display">—%</span> of labour force</label>
    <input id="draft-slider" type="range" min="0" max="30" step="1" value="5" />
    <div class="slider-info">
      <small>Troops: <span id="draft-troops">—</span></small>
    </div>
  </div>
</div>
`;

  // Defense budget slider
  const s = byId("defense-budget-slider");
  if (s) {
    const pct0 = safeNumber(econ?.military?.budgetPct, 0.10);
    s.value = String(Math.round(pct0 * 100));
    const update = () => {
      const pct = safeNumber(s.value, 10) / 100;
      econ.military = econ.military || {};
      econ.military.budgetPct = clamp01(pct);
      const dd = byId("defense-budget-display");
      if (dd) dd.textContent = Math.round(econ.military.budgetPct * 100) + "%";
      if (window.updateEconomy) window.updateEconomy();
    };
    s.addEventListener("input", update);
    update();
  }

  // Draft slider
  const d = byId("draft-slider");
  if (d) {
    d.value = String(Math.round((safeNumber(econ?.military?.draftPct, 0.05)) * 100));
    const updateDraft = () => {
      econ.military = econ.military || {};
      const pct = safeNumber(d.value, 5) / 100; // 0..0.30 UI constraint
      econ.military.draftPct = Math.max(0, Math.min(0.30, pct));
      if (window.updateEconomy) window.updateEconomy();
    };
    d.addEventListener("input", updateDraft);
    updateDraft();
  }
}

/* ===================== Economy + Sim Logic ====================== */
function initEconomyLogic() {
  // Elements
  const elems = {
    stabValue: assertEl("stab-value"),
    stabGrowth: assertEl("stab-growth"),
    gdpTotal: assertEl("econ-gdp-total"),
    gdpGrowth: assertEl("econ-gdp-growth"),
    pop: assertEl("econ-population"),
    popGrowth: assertEl("econ-pop-growth"),
    lf: assertEl("econ-labour-force"),
    lfGrowth: assertEl("econ-labour-growth"),
    prod: assertEl("econ-labour-productivity"),
    prodGrowth: assertEl("econ-prod-growth"),
    treasury: assertEl("econ-treasury-total"),
    govRev: assertEl("econ-gov-revenue"),
    taxSlider: assertEl("tax-slider"),
    taxRateDisplay: assertEl("tax-rate-display"),
    taxStabEffect: assertEl("tax-stability-effect"),
    taxRevEffect: assertEl("tax-revenue-effect"),
    consSlider: assertEl("consumption-slider"),
    consDisplay: assertEl("consumption-display"),
    ciPopEffect: assertEl("ci-pop-effect"),
    invSlider: assertEl("investment-slider"),
    invDisplay: assertEl("investment-display"),
    ciProdEffect: assertEl("ci-prod-effect"),
  };

  // Normalize sliders so Tax+Cons+Inv == 100
  function normalizeSliders(changed) {
    const tax = safeNumber(elems.taxSlider?.value, 0);
    const cons = safeNumber(elems.consSlider?.value, 0);
    const inv = safeNumber(elems.invSlider?.value, 0);
    const total = tax + cons + inv;
    if (total === 100) return;

    const all = [elems.taxSlider, elems.consSlider, elems.invSlider].filter(Boolean);
    const others = all.filter((s) => s !== changed);
    const sumOthers = others.reduce((sum, s) => sum + safeNumber(s.value, 0), 0);
    const remainder = 100 - safeNumber(changed.value, 0);

    if (sumOthers <= 0) {
      const each = Math.max(0, Math.round(remainder / others.length));
      others.forEach((s) => (s.value = String(each)));
    } else {
      // Proportional adjustment + rounding fixup to hit exactly 100
      let acc = 0;
      others.forEach((s, i) => {
        const raw = (safeNumber(s.value, 0) * remainder) / sumOthers;
        const v = i === others.length - 1 ? remainder - acc : Math.round(raw);
        s.value = String(Math.max(0, v));
        acc += v;
      });
    }
  }

  // Seed economy from selected country
  const pid = state?.gameState?.playerCountryId;
  const cd = state?.countryData?.[pid];
  const pop0 = safeNumber(cd?.population, 1_000_000);
  const gdpReported = safeNumber(cd?.GDP, 100); // assume "in millions" unless your data says otherwise

  // Sliders exist because we just rendered the page
  const taxInit = safeNumber(elems.taxSlider?.value, 30) / 100;
  const consInit = safeNumber(elems.consSlider?.value, 35) / 100;
  const invInit = safeNumber(elems.invSlider?.value, 35) / 100;

  econ = {
    pop: pop0,
    stability: 0.60,
    labourForce: pop0 * 0.60,
    taxRate: clamp01(taxInit),
    cons: clamp01(consInit),
    inv: clamp01(invInit),
    last: {},
    military: (econ && econ.military) || {}, // preserve previous if any
  };

  // Productivity and GDP (internal dollars)
  // If cd.GDP is "in millions", multiply by 1e6 to convert to base currency units.
  const GDP_units = gdpReported * 1e6;
  econ.productivity = Math.max(1, GDP_units / Math.max(1, econ.labourForce));
  econ.GDP = econ.labourForce * econ.productivity; // recompute
  econ.labourCapita = econ.productivity;

  // Military defaults (only set if missing to preserve persistence across rebuilds)
  if (typeof econ.military.draftPct !== "number") econ.military.draftPct = 0.05;
  if (typeof econ.military.equipPower !== "number") econ.military.equipPower = 100;
  if (typeof econ.military.readiness !== "number") econ.military.readiness = 0.70;
  if (typeof econ.military.budgetPct !== "number") econ.military.budgetPct = 0.10;

  econ.military.upkeepPerTroopDaily = safeNumber(econ.military.upkeepPerTroopDaily, 50);
  econ.military.upkeepPerEquipPowerAnnual = safeNumber(econ.military.upkeepPerEquipPowerAnnual, 100_000);
  econ.military.procurementEfficiency = safeNumber(econ.military.procurementEfficiency, 1e-7);

  // Treasury: seed ~30 days revenue if fresh
  if (!Number.isFinite(econ.treasury)) {
    const dailyInc0 = (econ.GDP * econ.taxRate) / DAYS_IN_YEAR;
    econ.treasury = dailyInc0 * 30;
  }

  // Strength per troop (productivity → diminishing returns)
  function strengthFromProd(prod) {
    const BASE_PROD = 100_000; // $ per worker baseline
    const ratio = Math.sqrt(Math.max(prod, 1) / BASE_PROD);
    return Math.max(0.25, Math.min(4, ratio));
  }

  /* -------------------- Sim Loop (daily core) -------------------- */
  function advanceEconomy(days = 1) {
    days = Math.max(0, Math.floor(days)) || 1;

    // Stability drift (annualized)
    const annualStabRate = 0.3 - econ.taxRate; // higher tax → lower stability
    econ.stability = clamp01(econ.stability + (annualStabRate / DAYS_IN_YEAR) * days);

    // Population growth (consumption supports families; baseline drag is -3%)
    const annualPopRate = econ.cons * 0.10 - 0.03;
    econ.pop *= Math.pow(1 + annualPopRate / DAYS_IN_YEAR, days);

    // Labour force BEFORE draft (stability-dependent 20%..80% of pop)
    const labourForceShare = 0.2 + clamp01(econ.stability) * (0.8 - 0.2);
    const baseLF = econ.pop * labourForceShare;

    // Draft removes workers from economy
    const draftPct = Math.max(0, Math.min(0.30, econ.military?.draftPct ?? 0));
    const draftedLF = baseLF * draftPct; // troops
    const econLF = baseLF * (1 - draftPct); // civilians

    econ.labourForceBase = baseLF; // for UI
    econ.troops = draftedLF;
    econ.labourForce = econLF;

    // Productivity growth (investment-driven; baseline drag is -3%)
    const annualProdRate = econ.inv * 0.10 - 0.03;
    econ.productivity *= Math.pow(1 + annualProdRate / DAYS_IN_YEAR, days);

    // GDP from *civilian* labour only
    econ.GDP = econ.labourForce * econ.productivity;

    // Government revenue → Treasury
    const dailyIncome = (econ.GDP * econ.taxRate) / DAYS_IN_YEAR;
    econ.treasury += dailyIncome * days;

    // --- Military finance ---
    const troops = draftedLF;
    const spt = strengthFromProd(econ.productivity);
    const basePower = troops * spt;
    let equipPower = safeNumber(econ.military.equipPower, 0);

    // Upkeep (troops + equipment)
    const troopUpkPerDay = safeNumber(econ.military.upkeepPerTroopDaily, 0) * troops;
    const equipUpkPerDay =
      (safeNumber(econ.military.upkeepPerEquipPowerAnnual, 0) / DAYS_IN_YEAR) * equipPower;

    const requiredUpkeep = (troopUpkPerDay + equipUpkPerDay) * days;
    const upkeepPaid = Math.min(requiredUpkeep, Math.max(0, econ.treasury));
    econ.treasury -= upkeepPaid;

    // Procurement (budget % of revenue), then decay
    const budgetPerDay = dailyIncome * clamp01(econ.military?.budgetPct ?? 0);
    const procurementPlanned = budgetPerDay * days;
    const procurementSpend = Math.min(procurementPlanned, Math.max(0, econ.treasury));
    econ.treasury -= procurementSpend;

    // Equipment decays; coverage modifies decay and readiness
    const baseDecayPerDay = 0.01 / DAYS_IN_YEAR; // ~1%/yr baseline
    equipPower *= Math.pow(1 - baseDecayPerDay, days);

    const coverage = requiredUpkeep > 0 ? upkeepPaid / requiredUpkeep : 1;
    if (coverage < 1) {
      const shortfall = 1 - coverage;
      const extraDecayPerDay = (0.04 * shortfall) / DAYS_IN_YEAR; // up to +4%/yr if starved
      equipPower *= Math.pow(1 - extraDecayPerDay, days);
      econ.military.readiness = Math.max(
        0,
        (econ.military.readiness ?? 0.7) - 0.003 * shortfall * days
      );
    } else {
      econ.military.readiness = Math.min(1, (econ.military.readiness ?? 0.7) + 0.001 * days);
    }

    // Procurement adds equipment
    const equipGain = procurementSpend * safeNumber(econ.military.procurementEfficiency, 1e-7);
    equipPower += equipGain;

    econ.military.equipPower = Math.max(0, equipPower);
    econ.military.power = Math.max(0, basePower + equipPower);

    // Net treasury change per-day basis (for annualized UI)
    const netDay = dailyIncome - upkeepPaid / days - procurementSpend / days;

    // Store “per-day” metrics for UI; we annualize in recalc()
    econ.last = econ.last || {};
    econ.last.net = netDay;
    econ.last.dailyIncome = dailyIncome;
    econ.last.upkeep = troopUpkPerDay + equipUpkPerDay;
    econ.last.upkeepPaid = upkeepPaid / days;
    econ.last.plannedDefense = budgetPerDay;
    econ.last.procurementSpend = procurementSpend / days;
    econ.last.actualDefense = econ.last.upkeepPaid + econ.last.procurementSpend;

    // Approx power delta (equipment change minus base decay component)
    const equipDecayPerDay = baseDecayPerDay; // baseline portion already applied above
    econ.last.powerDelta = (equipGain / days) - equipDecayPerDay * equipPower;
  }
  // expose for timer loop
  window.advanceEconomy = advanceEconomy;

  /* -------------------------- Recalc UI ------------------------- */
  function recalc() {
    if (!econ) return;

    // Annual rates (display)
    const rawStabRate = 0.3 - econ.taxRate;
    const popRate = econ.cons * 0.10 - 0.03;
    const prodRate = econ.inv * 0.10 - 0.03;
    const stabRate = econ.stability < 1 ? rawStabRate : 0;

    // Labour rate proxy (stability influences LF share; pop affects size)
    const labourRate = (1 + popRate) * (1 + stabRate) - 1;
    const annualGdpRate = (1 + labourRate) * (1 + prodRate) - 1;

    const stabGr = (stabRate * 100).toFixed(2) + "% /yr";
    const popGr = (popRate * 100).toFixed(2) + "% /yr";
    const lfGr = (labourRate * 100).toFixed(2) + "% /yr";
    const prodGr = (prodRate * 100).toFixed(2) + "% /yr";
    const gdpGr = (annualGdpRate * 100).toFixed(2) + "% /yr";

    // Economy cards
    const dv = (id, text) => {
      const e = byId(id);
      if (e) e.textContent = text;
    };

    dv("stab-value", (econ.stability * 100).toFixed(2) + "%");
    dv("stab-growth", stabGr);

    dv("econ-gdp-total", formatCompactNumber(econ.GDP));
    dv("econ-gdp-growth", gdpGr);

    dv("econ-population", formatCompactNumber(econ.pop));
    dv("econ-pop-growth", popGr);

    dv("econ-labour-force", formatCompactNumber(econ.labourForce));
    dv("econ-labour-growth", lfGr);

    dv("econ-labour-productivity", formatCompactNumber(econ.productivity));
    dv("econ-prod-growth", prodGr);

    const dailyIncome = (econ.GDP * econ.taxRate) / DAYS_IN_YEAR;
    const annualIncome = dailyIncome * DAYS_IN_YEAR;
    dv("econ-treasury-total", formatCompactNumber(econ.treasury));
    dv("econ-gov-revenue", formatCompactNumber(annualIncome));

    // Sliders (annual effects, value readouts)
    dv("tax-rate-display", (econ.taxRate * 100).toFixed(0) + "%");
    dv("tax-stability-effect", stabGr);
    dv("tax-revenue-effect", formatCompactNumber(annualIncome));
    dv("consumption-display", (econ.cons * 100).toFixed(0) + "%");
    dv("ci-pop-effect", popGr);
    dv("investment-display", (econ.inv * 100).toFixed(0) + "%");
    dv("ci-prod-effect", prodGr);

    // ---- Military (annualized) ----
    const draftPct = clamp01(econ.military?.draftPct ?? 0);
    const troops =
      typeof econ.troops === "number"
        ? econ.troops
        : (econ.labourForceBase ?? econ.labourForce / Math.max(1e-9, 1 - draftPct)) * draftPct;

    const spt = (() => {
      const BASE = 100_000;
      const r = Math.sqrt(Math.max(econ.productivity, 1) / BASE);
      return Math.max(0.25, Math.min(4, r));
    })();

    const basePower = troops * spt;
    const equipPower = safeNumber(econ.military?.equipPower, 0);
    const totalPower = Math.max(0, basePower + equipPower);

    dv("draft-display", Math.round(draftPct * 100) + "%");
    dv("draft-troops", formatCompactNumber(troops));

    dv("mil-power", formatCompactNumber(Math.round(totalPower)));
    dv("mil-troop-power", formatCompactNumber(Math.round(basePower)));
    dv("mil-equip-power", formatCompactNumber(Math.round(equipPower)));

    const perTroopUpk = safeNumber(econ.military?.upkeepPerTroopDaily, 0) * troops;
    const perEquipUpk =
      (safeNumber(econ.military?.upkeepPerEquipPowerAnnual, 0) / DAYS_IN_YEAR) * equipPower;

    const upkeepDay = perTroopUpk + perEquipUpk;
    const upkeepYear = upkeepDay * DAYS_IN_YEAR;

    dv("mil-upkeep", formatCompactNumber(upkeepYear));
    dv("mil-upkeep-paid", formatCompactNumber(safeNumber(econ.last?.upkeepPaid, 0) * DAYS_IN_YEAR));
    dv("mil-upkeep-req", formatCompactNumber((safeNumber(econ.last?.upkeep, upkeepDay)) * DAYS_IN_YEAR));
    dv("mil-treasury", formatCompactNumber(econ.treasury));
    dv("mil-daily-income", formatCompactNumber(safeNumber(econ.last?.dailyIncome, dailyIncome) * DAYS_IN_YEAR));

    const powDeltaYear = safeNumber(econ.last?.powerDelta, 0) * DAYS_IN_YEAR;
    dv("mil-power-delta", formatCompactNumber(powDeltaYear) + " /yr");

    const readiness = clamp01(econ.military.readiness ?? 0.7);
    dv("mil-readiness", (readiness * 100).toFixed(0) + "%");

    const netDay = econ.last?.net ?? (dailyIncome - upkeepDay - dailyIncome * clamp01(econ.military?.budgetPct ?? 0));
    dv("mil-net", formatCompactNumber(netDay * DAYS_IN_YEAR));

    dv("defense-budget-display", Math.round(clamp01(econ.military?.budgetPct ?? 0) * 100) + "%");
    dv("defense-planned-spend", formatCompactNumber(annualIncome * clamp01(econ.military?.budgetPct ?? 0)));

    // Readiness trend (yearly)
    const elReadTrend = byId("mil-readiness-trend");
    if (elReadTrend) {
      const upk = safeNumber(econ.last?.upkeep, upkeepDay);
      const upkPaid = safeNumber(econ.last?.upkeepPaid, upk);
      const coverage = upk > 0 ? upkPaid / upk : 1;
      const driftYr = coverage < 1 ? -0.003 * (1 - coverage) * DAYS_IN_YEAR : 0.001 * DAYS_IN_YEAR;
      elReadTrend.textContent = (driftYr * 100).toFixed(1) + "% /yr";
    }
  }

  // Slider handlers
  [elems.taxSlider, elems.consSlider, elems.invSlider]
    .filter(Boolean)
    .forEach((slider) =>
      slider.addEventListener("input", () => {
        normalizeSliders(slider);
        econ.taxRate = clamp01(safeNumber(elems.taxSlider.value, 30) / 100);
        econ.cons = clamp01(safeNumber(elems.consSlider.value, 35) / 100);
        econ.inv = clamp01(safeNumber(elems.invSlider.value, 35) / 100);
        recalc();
      })
    );

  // expose UI refresh for others (e.g., military sliders)
  window.updateEconomy = recalc;

  // Initial paint
  recalc();
  updateClockDisplay();
}

/* =========================== Entrypoint =========================== */
export function startGame() {
  // Ensure state scaffolding exists
  state.gameState = state.gameState || {};
  state.gameState.control = state.gameState.control || {};

  // Choose/confirm country
  if (state.confirmedCountryId == null) {
    console.warn("[sidebar] No confirmedCountryId on state; sidebar will render with blanks.");
  }
  state.gameState.playerCountryId = state.confirmedCountryId ?? state.gameState.playerCountryId ?? 0;
  state.gameState.control[state.gameState.playerCountryId] =
    safeNumber(state.gameState.control[state.gameState.playerCountryId], 0) || 100;

  resetSimulationDate();
  buildGameSidebar();
  updateClockDisplay();
}

/* ==================== Optional helper for timer =================== */
/** Call this from your timer tick if you want a one-stop hook. */
export function handleSimulationTick(days = 1) {
  if (typeof window.advanceEconomy === "function") {
    window.advanceEconomy(days);
  }
  if (typeof window.updateEconomy === "function") {
    window.updateEconomy();
  }
  updateClockDisplay();
}
