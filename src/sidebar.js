// sidebar.js — Diplomacy (map-driven), Economy, Military
// Public API: export { updateClockDisplay, startGame, handleSimulationTick }
// Map hook: window.setSelectedCountry(id) OR dispatch 'gc:countrySelected' with {id}

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
let econ = null;                    // economy + military live state
const DAYS_IN_YEAR = 365;

/* ============================== Utils ============================== */
const byId = (id) => /** @type {HTMLElement|null} */ (document.getElementById(id));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const safeNumber = (n, fb = 0) => (Number.isFinite(+n) ? +n : fb);

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
    el.textContent = String(simulationDate).slice(0, 10);
  }
}

/* ======================= Diplomacy State Core ====================== */
/**
 * Store diplomacy under state.diplomacy:
 *  - relations[a][b] = {
 *      score: -100..+100,
 *      treaties: { nap:boolean, alliance:boolean },
 *      atWar:boolean,
 *      trade: 0..3
 *    }
 * We mirror symmetric fields when we change them.
 */
function ensureDiplomacyState() {
  if (!state.diplomacy) state.diplomacy = { relations: {} };
  const rel = state.diplomacy.relations;

  const ids = Object.keys(state.countryData || {});
  for (const a of ids) {
    rel[a] = rel[a] || {};
    for (const b of ids) {
      if (a === b) continue;
      if (!rel[a][b]) {
        rel[a][b] = {
          score: 50, // NEUTRAL baseline on 0..100
          treaties: { nap: false, alliance: false },
          atWar: false,
          trade: 1, // unused now, safe to keep
        };
      }
    }
  }
}

function getRel(a, b) {
  ensureDiplomacyState();
  return state.diplomacy.relations?.[a]?.[b];
}

function setRelSym(a, b, patch) {
  ensureDiplomacyState();
  const A = getRel(a, b);
  const B = getRel(b, a);
  Object.assign(A, patch);
  Object.assign(B, patch);
}

function modRelScore(a, b, delta) {
  const A = getRel(a, b);
  const B = getRel(b, a);
  A.score = Math.max(0, Math.min(100, A.score + delta));
  B.score = Math.max(0, Math.min(100, B.score + delta));
}

// 0..100 interpretation
function stanceWord(score) {
  if (score >= 85) return "Allied";
  if (score >= 70) return "Friendly";
  if (score >= 55) return "Warm";
  if (score >= 45) return "Neutral";
  if (score >= 30) return "Cool";
  if (score >= 15) return "Hostile";
  return "Rival";
}


/* ============================ Sidebar UI =========================== */
export function buildGameSidebar() {
  const sidebar = byId("sidebar");
  if (!sidebar) { console.warn("[sidebar] #sidebar not found"); return; }

  sidebar.innerHTML = `
<div id="drag-handle"></div>

<!-- Settings + Time -->
<div class="box" id="box-settings">
  <button id="settings-btn-sidebar" class="time-btn">Settings</button>
  <div id="time-box">
    <div id="time-date">Date: <span id="sim-clock" class="toolbar-date">—</span></div>
    <div id="time-controls">
      <button data-speed="0" class="time-btn" title="Pause">❚❚</button>
      <button data-speed="5" class="time-btn" title="5× speed">5×</button>
      <button data-speed="15" class="time-btn" title="15× speed">15×</button>
      <button data-speed="50" class="time-btn" title="50× speed">50×</button>
      <button data-speed="100" class="time-btn" title="100× speed">100×</button>
      <button data-speed="100000" class="time-btn" title="100000× speed">100000×</button>
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

  // Header
  const pid = state?.gameState?.playerCountryId;
  const cname = state?.countryData?.[pid]?.name ?? "—";
  const headerEl = byId("in-game-header");
  if (headerEl) headerEl.textContent = cname;

  // Settings
  byId("settings-btn-sidebar")?.addEventListener("click", () => {
    byId("settings-modal")?.classList.remove("hidden");
  });

  // Time controls
  sidebar.querySelectorAll("#time-controls button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const speed = Number(btn.getAttribute("data-speed"));
      if (speed === 0) pauseTimer(); else { setTimeScale(speed); startTimer(); }
      sidebar.querySelectorAll("#time-controls button")
        .forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  // Tabs
  const modes = ["diplomacy", "economy", "military"];
  modes.forEach((mode) => {
    byId(`mode-${mode}`)?.addEventListener("click", () => {
      modes.forEach((m) => {
        byId(`mode-${m}`)?.classList.toggle("active", m === mode);
        const page = byId(`content-${m}`);
        if (page) page.style.display = m === mode ? "block" : "none";
      });
    });
  });

  // Pages
  buildDiplomacy();   // map-driven diplomacy
  buildEconomy();     // seeds econ via initEconomyLogic()
  buildMilitary();    // reads econ

  updateClockDisplay();
}

/* ========================= Page: Diplomacy ========================= */
function buildDiplomacy() {
  const el = byId("content-diplomacy");
  if (!el) return;

  ensureDiplomacyState();

  el.innerHTML = `
<div class="diplo-wrap">

  <div class="econ-grid">
    <div class="econ-card">
      <div class="card-header">Country</div>
      <div class="card-value"><span id="diplo-country-name">—</span></div>
      <div class="card-growth">Cost to Improve: $<span id="diplo-cost-improve">—</span></div>
    </div>

    <div class="econ-card">
      <div class="card-header">Stance</div>
      <div class="card-value"><span id="diplo-stance">—</span></div>
      <div class="card-growth"><span id="diplo-score">0</span> / 100</div>
    </div>

    <div class="econ-card">
      <div class="card-header">Treaties</div>
      <div class="card-value"><span id="diplo-treaties">—</span></div>
      <div class="card-growth">War: <span id="diplo-war">No</span></div>
    </div>

    <div class="econ-card">
      <div class="card-header">Treasury</div>
      <div class="card-value">$<span id="diplo-treasury">—</span></div>
      <div class="card-growth">Per year: +$<span id="diplo-revenue">—</span></div>
    </div>
  </div>

  <div class="econ-card slider-card">
    <div class="card-header"><span>Actions</span></div>
    <div class="diplo-actions">
      <button id="btn-diplo-improve">Improve Relations (+10)</button>
      <button id="btn-diplo-aid">$50M Aid (+15)</button>
      <button id="btn-diplo-toggle-nap">Sign NAP</button>
      <button id="btn-diplo-toggle-alliance">Form Alliance</button>
      <button id="btn-diplo-toggle-war" class="danger">Declare War</button>
    </div>
    <small id="diplo-hint" class="muted"></small>
  </div>
</div>
`;

  // Map → Sidebar hook (unconditional, allows self click; actions get disabled there)
  window.setSelectedCountry = function setSelectedCountry(id) {
    if (!id) return;
    state.gameState.selectedDiploTarget = String(id);
    renderDiplomacy();
  };

  // Also listen to a custom event (if the map dispatches instead of calling)
  document.addEventListener("gc:countrySelected", (ev) => {
    const id = String(ev?.detail?.id ?? "");
    window.setSelectedCountry?.(id);
  });

  // Button wiring
  byId("btn-diplo-improve")?.addEventListener("click", () => doImprove());
  byId("btn-diplo-aid")?.addEventListener("click", () => doAid());
  byId("btn-diplo-toggle-nap")?.addEventListener("click", () => toggleNAP());
  byId("btn-diplo-toggle-alliance")?.addEventListener("click", () => toggleAlliance());
  byId("btn-diplo-toggle-war")?.addEventListener("click", () => toggleWar());

  // Initial paint (if the map has already picked a target)
  renderDiplomacy();
}

function renderDiplomacy() {
  const playerId  = String(state?.gameState?.playerCountryId ?? "");
  const targetId  = String(state?.gameState?.selectedDiploTarget ?? "");

  // Always show the target name if known
  const targetName = state.countryData?.[targetId]?.name ?? "—";
  const targetLbl = document.getElementById("diplo-target-name");
  if (targetLbl) targetLbl.textContent = targetName;
  const countryCardName = document.getElementById("diplo-country-name");
  if (countryCardName) countryCardName.textContent = targetName;

  // Treasury & revenue (always visible)
  const dailyIncome = econ ? (econ.GDP * econ.taxRate) / DAYS_IN_YEAR : 0;
  const annualIncome = dailyIncome * DAYS_IN_YEAR;
  const tre = econ?.treasury ?? 0;
  byId("diplo-treasury")?.replaceChildren(document.createTextNode(formatCompactNumber(tre)));
  byId("diplo-revenue")?.replaceChildren(document.createTextNode(formatCompactNumber(annualIncome)));

  // No valid target yet
  if (!targetId || !state.countryData?.[targetId]) {
    ["diplo-stance","diplo-score","diplo-treaties","diplo-war","diplo-country-name","diplo-cost-improve"]
      .forEach(id => { const e = byId(id); if (e) e.textContent = "—"; });
    ["btn-diplo-improve","btn-diplo-aid","btn-diplo-toggle-nap","btn-diplo-toggle-alliance","btn-diplo-toggle-war"]
      .forEach(id => byId(id)?.setAttribute("disabled",""));
    const hint = byId("diplo-hint");
    if (hint) hint.textContent = "Click a country on the map to select a diplomacy target.";
    return;
  }

  // If self-target: show neutral UI and disable actions (but still show the name)
  if (targetId === playerId) {
    byId("diplo-stance")?.replaceChildren(document.createTextNode("—"));
    byId("diplo-score")?.replaceChildren(document.createTextNode("—"));
    byId("diplo-treaties")?.replaceChildren(document.createTextNode("—"));
    byId("diplo-war")?.replaceChildren(document.createTextNode("No"));
    // keep country name visible on the card
    if (countryCardName) countryCardName.textContent = targetName;
    byId("diplo-cost-improve")?.replaceChildren(document.createTextNode("—"));
    ["btn-diplo-improve","btn-diplo-aid","btn-diplo-toggle-nap","btn-diplo-toggle-alliance","btn-diplo-toggle-war"]
      .forEach(id => byId(id)?.setAttribute("disabled",""));
    const hint = byId("diplo-hint");
    if (hint) hint.textContent = "Select a different country to conduct diplomacy.";
    return;
  }

  // Real target: pull / init relations
  ensureDiplomacyState();
  const R = getRel(playerId, targetId);
  const improveCost = econ.GDP*0.02;
  const aidCost     = econ.GDP*0.08;

  // Write UI
  byId("diplo-stance")?.replaceChildren(document.createTextNode(stanceWord(R.score)));
  byId("diplo-score")?.replaceChildren(document.createTextNode(String(R.score)));
  const treatiesStr = `${R.treaties.nap ? "NAP " : ""}${R.treaties.alliance ? "Alliance " : ""}`.trim() || "—";
  byId("diplo-treaties")?.replaceChildren(document.createTextNode(treatiesStr));
  byId("diplo-war")?.replaceChildren(document.createTextNode(R.atWar ? "Yes" : "No"));
  byId("diplo-cost-improve")?.replaceChildren(document.createTextNode(formatCompactNumber(improveCost)));
  if (countryCardName) countryCardName.textContent = targetName;

  // Buttons reflect state
  const bNap = byId("btn-diplo-toggle-nap");
  const bAll = byId("btn-diplo-toggle-alliance");
  const bWar = byId("btn-diplo-toggle-war");
  if (bNap) bNap.textContent = R.treaties.nap ? "Renounce NAP" : "Sign NAP";
  if (bAll) bAll.textContent = R.treaties.alliance ? "Leave Alliance" : "Form Alliance";
  if (bWar) bWar.textContent = R.atWar ? "Offer Peace" : "Declare War";

  // Enable/disable per conditions
  byId("btn-diplo-improve")?.toggleAttribute?.("disabled", (tre < improveCost));
  byId("btn-diplo-aid")?.toggleAttribute?.("disabled", (tre < aidCost));
  bNap?.toggleAttribute?.("disabled", !R.treaties.nap && R.score < 60);
  bAll?.toggleAttribute?.("disabled", (!R.treaties.alliance && (R.score < 80 || R.atWar)));

  const hint = byId("diplo-hint");
  if (hint) {
    hint.textContent =
      R.treaties.alliance
        ? "Leaving an alliance reduces relations by 20."
        : "Improving relations or sending aid can unlock NAPs (≥ 60) and Alliances (≥ 80). Declaring war sets relations to 10.";
  }
}


/* ======== Diplomacy Actions (spend money, mutate symmetric state) ======== */
function spend(amount) {
  if (!econ) return false;
  if ((econ.treasury ?? 0) < amount) return false;
  econ.treasury -= amount;
  window.updateEconomy?.(); // refresh money readouts elsewhere
  return true;
}

function doImprove() {
  const pid = String(state?.gameState?.playerCountryId ?? "");
  const tid = String(state?.gameState?.selectedDiploTarget ?? "");
  if (!pid || !tid || pid === tid) return;

  const COST = 10_000_000; // $10M
  if (!spend(COST)) return;
  modRelScore(pid, tid, +10); // +10 relations
  renderDiplomacy();
}

function doAid() {
  const pid = String(state?.gameState?.playerCountryId ?? "");
  const tid = String(state?.gameState?.selectedDiploTarget ?? "");
  if (!pid || !tid || pid === tid) return;

  const COST = 50_000_000; // $50M
  if (!spend(COST)) return;
  modRelScore(pid, tid, +15);
  // small trade bump
  const R = getRel(pid, tid);
  R.trade = Math.min(3, (R.trade ?? 1) + 1);
  setRelSym(pid, tid, { trade: R.trade, score: R.score });
  renderDiplomacy();
}

function toggleNAP() {
  const pid = String(state?.gameState?.playerCountryId ?? "");
  const tid = String(state?.gameState?.selectedDiploTarget ?? "");
  if (!pid || !tid || pid === tid) return;

  const R = getRel(pid, tid);
  const now = !R.treaties.nap;
  R.treaties.nap = now;
  // Signing a NAP nudges relations +5, renouncing -10
  modRelScore(pid, tid, now ? +5 : -10);
  setRelSym(pid, tid, { treaties: R.treaties, score: R.score });
  renderDiplomacy();
}

function toggleAlliance() {
  const pid = String(state?.gameState?.playerCountryId ?? "");
  const tid = String(state?.gameState?.selectedDiploTarget ?? "");
  if (!pid || !tid || pid === tid) return;

  const R = getRel(pid, tid);
  const becomingAllied = !R.treaties.alliance;

  // Preconditions to join: relations ≥ 60, not at war
  if (becomingAllied && (R.score < 60 || R.atWar)) return;

  R.treaties.alliance = becomingAllied;
  modRelScore(pid, tid, becomingAllied ? +10 : -20);
  setRelSym(pid, tid, { treaties: R.treaties, score: R.score });

  // Small trade boost when allied
  if (becomingAllied) {
    R.trade = Math.min(3, (R.trade ?? 1) + 1);
    setRelSym(pid, tid, { trade: R.trade });
  }
  renderDiplomacy();
}

function toggleWar() {
  const pid = String(state?.gameState?.playerCountryId ?? "");
  const tid = String(state?.gameState?.selectedDiploTarget ?? "");
  if (!pid || !tid || pid === tid) return;

  const R = getRel(pid, tid);
  const goingToWar = !R.atWar;

  if (goingToWar) {
    // break treaties, tank relations
    R.atWar = true;
    R.treaties.nap = false;
    R.treaties.alliance = false;
    R.trade = Math.max(0, R.trade - 1);
    R.score = -80;
  } else {
    // peace: stop war, relax hostility towards -20 if worse
    R.atWar = false;
    R.score = Math.max(R.score, -20);
  }
  setRelSym(pid, tid, { atWar: R.atWar, treaties: R.treaties, trade: R.trade, score: R.score });
  renderDiplomacy();
}

/* ========================== Page: Economy ========================== */
function buildEconomy() {
  const el = byId("content-economy");
  if (!el) return;

  el.innerHTML = `
<div class="econ-grid">
  <div class="econ-card">
    <div class="card-header">Stability</div>
    <div class="card-value"><span id="stab-value">—%</span></div>
    <div class="card-growth"><span id="stab-growth">—% /yr</span></div>
  </div>
  <div class="econ-card">
    <div class="card-header">GDP</div>
    <div class="card-value">$<span id="econ-gdp-total">—</span></div>
    <div class="card-growth"><span id="econ-gdp-growth">—% /yr</span></div>
  </div>
  <div class="econ-card">
    <div class="card-header">Population</div>
    <div class="card-value"><span id="econ-population">—</span></div>
    <div class="card-growth"><span id="econ-pop-growth">—% /yr</span></div>
  </div>
  <div class="econ-card">
    <div class="card-header">Labour Force</div>
    <div class="card-value"><span id="econ-labour-force">—</span></div>
    <div class="card-growth"><span id="econ-labour-growth">—% /yr</span></div>
  </div>
  <div class="econ-card">
    <div class="card-header">Productivity</div>
    <div class="card-value"><span id="econ-labour-productivity">—</span></div>
    <div class="card-growth"><span id="econ-prod-growth">—% /yr</span></div>
  </div>
  <div class="econ-card">
    <div class="card-header">Treasury</div>
    <div class="card-value">$<span id="econ-treasury-total">—</span></div>
    <div class="card-growth">+$<span id="econ-gov-revenue">—</span>/yr</div>
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
  const el = byId("content-military");
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
    <div class="card-growth"><span id="mil-power-delta">—/yr</span></div>
  </div>
  <div class="econ-card">
    <div class="card-header">Readiness</div>
    <div class="card-value"><span id="mil-readiness">—%</span></div>
    <div class="card-growth"><span id="mil-readiness-trend">—/yr</span></div>
  </div>
  <div class="econ-card">
    <div class="card-header">Upkeep</div>
    <div class="card-value">$<span id="mil-upkeep">—</span>/yr</div>
    <div class="card-growth">
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

  // budget
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
      window.updateEconomy?.();
    };
    s.addEventListener("input", update);
    update();
  }

  // draft
  const d = byId("draft-slider");
  if (d) {
    d.value = String(Math.round((safeNumber(econ?.military?.draftPct, 0.05)) * 100));
    const updateDraft = () => {
      econ.military = econ.military || {};
      const pct = safeNumber(d.value, 5) / 100;
      econ.military.draftPct = Math.max(0, Math.min(0.30, pct));
      window.updateEconomy?.();
    };
    d.addEventListener("input", updateDraft);
    updateDraft();
  }
}

/* ===================== Economy + Sim Logic ====================== */
function initEconomyLogic() {
  // Elements exist because page just rendered
  const taxSlider = byId("tax-slider");
  const consSlider = byId("consumption-slider");
  const invSlider = byId("investment-slider");

  function normalizeSliders(changed) {
    const tax = safeNumber(taxSlider?.value, 0);
    const cons = safeNumber(consSlider?.value, 0);
    const inv = safeNumber(invSlider?.value, 0);
    const total = tax + cons + inv;
    if (total === 100) return;
    const all = [taxSlider, consSlider, invSlider].filter(Boolean);
    const others = all.filter((s) => s !== changed);
    const sumOthers = others.reduce((sum, s) => sum + safeNumber(s.value, 0), 0);
    const remainder = 100 - safeNumber(changed.value, 0);
    if (sumOthers <= 0) {
      const each = Math.max(0, Math.round(remainder / others.length));
      others.forEach((s) => (s.value = String(each)));
    } else {
      let acc = 0;
      others.forEach((s, i) => {
        const raw = (safeNumber(s.value, 0) * remainder) / sumOthers;
        const v = i === others.length - 1 ? remainder - acc : Math.round(raw);
        s.value = String(Math.max(0, v));
        acc += v;
      });
    }
  }

  // Seed from state
  const pid = state?.gameState?.playerCountryId;
  const cd = state?.countryData?.[pid];
  const pop0 = safeNumber(cd?.population, 1_000_000);
  const gdpReported = safeNumber(cd?.GDP, 100); // millions

  const taxInit = safeNumber(taxSlider?.value, 30) / 100;
  const consInit = safeNumber(consSlider?.value, 35) / 100;
  const invInit = safeNumber(invSlider?.value, 35) / 100;

  econ = {
    pop: pop0,
    stability: 0.60,
    labourForce: pop0 * 0.60,
    taxRate: clamp01(taxInit),
    cons: clamp01(consInit),
    inv: clamp01(invInit),
    last: {},
    military: (econ && econ.military) || {},
  };

  const GDP_units = gdpReported * 1e6;
  econ.productivity = Math.max(1, GDP_units / Math.max(1, econ.labourForce));
  econ.GDP = econ.labourForce * econ.productivity;

  if (typeof econ.military.draftPct !== "number") econ.military.draftPct = 0.05;
  if (typeof econ.military.equipPower !== "number") econ.military.equipPower = 100;
  if (typeof econ.military.readiness !== "number") econ.military.readiness = 0.70;
  if (typeof econ.military.budgetPct !== "number") econ.military.budgetPct = 0.10;
  econ.military.upkeepPerTroopDaily = safeNumber(econ.military.upkeepPerTroopDaily, 50);
  econ.military.upkeepPerEquipPowerAnnual = safeNumber(econ.military.upkeepPerEquipPowerAnnual, 100_000);
  econ.military.procurementEfficiency = safeNumber(econ.military.procurementEfficiency, 1e-7);

  if (!Number.isFinite(econ.treasury)) {
    const dailyInc0 = (econ.GDP * econ.taxRate) / DAYS_IN_YEAR;
    econ.treasury = dailyInc0 * 30; // ~30 days starting cash
  }

  function strengthFromProd(prod) {
    const BASE_PROD = 100_000;
    const ratio = Math.sqrt(Math.max(prod, 1) / BASE_PROD);
    return Math.max(0.25, Math.min(4, ratio));
  }

  function advanceEconomy(days = 1) {
    days = Math.max(0, Math.floor(days)) || 1;

    // capture previous total power for correct trend
    const prevTroops = Math.max(0, econ.troops ?? 0);
    const prevSpt = strengthFromProd(econ.productivity);
    const prevBasePower = prevTroops * prevSpt;
    const prevEquipPower = Math.max(0, econ.military?.equipPower ?? 0);
    const prevTotalPower = Math.max(0, prevBasePower + prevEquipPower);

    // Stability & growth
    const annualStabRate = 0.3 - econ.taxRate;
    econ.stability = clamp01(econ.stability + (annualStabRate / DAYS_IN_YEAR) * days);

    const annualPopRate = econ.cons * 0.10 - 0.03;
    econ.pop *= Math.pow(1 + annualPopRate / DAYS_IN_YEAR, days);

    const labourShare = 0.2 + clamp01(econ.stability) * (0.8 - 0.2);
    const baseLF = econ.pop * labourShare;

    const draftPct = Math.max(0, Math.min(0.30, econ.military?.draftPct ?? 0));
    const draftedLF = baseLF * draftPct;
    const econLF = baseLF * (1 - draftPct);

    econ.labourForceBase = baseLF;
    econ.troops = draftedLF;
    econ.labourForce = econLF;

    const annualProdRate = econ.inv * 0.10 - 0.03;
    econ.productivity *= Math.pow(1 + annualProdRate / DAYS_IN_YEAR, days);

    econ.GDP = econ.labourForce * econ.productivity;

    const dailyIncome = (econ.GDP * econ.taxRate) / DAYS_IN_YEAR;
    econ.treasury += dailyIncome * days;

    // Military finances
    const troops = draftedLF;
    const spt = strengthFromProd(econ.productivity);
    const basePower = troops * spt;
    let equipPower = safeNumber(econ.military.equipPower, 0);

    const troopUpkPerDay = safeNumber(econ.military.upkeepPerTroopDaily, 0) * troops;
    const equipUpkPerDay = (safeNumber(econ.military.upkeepPerEquipPowerAnnual, 0) / DAYS_IN_YEAR) * equipPower;

    const requiredUpkeep = (troopUpkPerDay + equipUpkPerDay) * days;
    const upkeepPaid = Math.min(requiredUpkeep, Math.max(0, econ.treasury));
    econ.treasury -= upkeepPaid;

    const budgetPerDay = dailyIncome * clamp01(econ.military?.budgetPct ?? 0);
    const procurementPlanned = budgetPerDay * days;
    const procurementSpend = Math.min(procurementPlanned, Math.max(0, econ.treasury));
    econ.treasury -= procurementSpend;

    const baseDecayPerDay = 0.01 / DAYS_IN_YEAR;
    equipPower *= Math.pow(1 - baseDecayPerDay, days);

    const coverage = requiredUpkeep > 0 ? upkeepPaid / requiredUpkeep : 1;
    if (coverage < 1) {
      const shortfall = 1 - coverage;
      const extraDecayPerDay = (0.04 * shortfall) / DAYS_IN_YEAR;
      equipPower *= Math.pow(1 - extraDecayPerDay, days);
      econ.military.readiness = Math.max(0, (econ.military.readiness ?? 0.7) - 0.003 * shortfall * days);
    } else {
      econ.military.readiness = Math.min(1, (econ.military.readiness ?? 0.7) + 0.001 * days);
    }

    const equipGain = procurementSpend * safeNumber(econ.military.procurementEfficiency, 1e-7);
    equipPower += equipGain;

    econ.military.equipPower = Math.max(0, equipPower);
    econ.military.power = Math.max(0, basePower + equipPower);

    // total power delta (per day)
    const newTotalPower = Math.max(0, econ.military.power);
    const deltaDay = (newTotalPower - prevTotalPower) / days;

    const netDay = dailyIncome - upkeepPaid / days - procurementSpend / days;
    econ.last = econ.last || {};
    econ.last.net = netDay;
    econ.last.dailyIncome = dailyIncome;
    econ.last.upkeep = troopUpkPerDay + equipUpkPerDay;
    econ.last.upkeepPaid = upkeepPaid / days;
    econ.last.plannedDefense = budgetPerDay;
    econ.last.procurementSpend = procurementSpend / days;
    econ.last.actualDefense = econ.last.upkeepPaid + econ.last.procurementSpend;
    econ.last.powerDelta = deltaDay;
  }
  window.advanceEconomy = advanceEconomy;

  function recalc() {
    const rawStabRate = 0.3 - econ.taxRate;
    const popRate = econ.cons * 0.10 - 0.03;
    const prodRate = econ.inv * 0.10 - 0.03;
    const stabRate = econ.stability < 1 ? rawStabRate : 0;
    const labourRate = (1 + popRate) * (1 + stabRate) - 1;
    const annualGdpRate = (1 + labourRate) * (1 + prodRate) - 1;

    const dv = (id, text) => { const e = byId(id); if (e) e.textContent = text; };

    dv("stab-value", (econ.stability * 100).toFixed(2) + "%");
    dv("stab-growth", (stabRate * 100).toFixed(2) + "% /yr");
    dv("econ-gdp-total", formatCompactNumber(econ.GDP));
    dv("econ-gdp-growth", (annualGdpRate * 100).toFixed(2) + "% /yr");
    dv("econ-population", formatCompactNumber(econ.pop));
    dv("econ-pop-growth", (popRate * 100).toFixed(2) + "% /yr");
    dv("econ-labour-force", formatCompactNumber(econ.labourForce));
    dv("econ-labour-growth", (labourRate * 100).toFixed(2) + "% /yr");
    dv("econ-labour-productivity", formatCompactNumber(econ.productivity));
    dv("econ-prod-growth", (prodRate * 100).toFixed(2) + "% /yr");

    const dailyIncome = (econ.GDP * econ.taxRate) / DAYS_IN_YEAR;
    const annualIncome = dailyIncome * DAYS_IN_YEAR;
    dv("econ-treasury-total", formatCompactNumber(econ.treasury));
    dv("econ-gov-revenue", formatCompactNumber(annualIncome));

    // Military reads
    const draftPct = clamp01(econ.military?.draftPct ?? 0);
    const troops = typeof econ.troops === "number"
      ? econ.troops
      : (econ.labourForceBase ?? econ.labourForce / Math.max(1e-9, 1 - draftPct)) * draftPct;

    const BASE = 100_000;
    const spt = Math.max(0.25, Math.min(4, Math.sqrt(Math.max(econ.productivity, 1) / BASE)));
    const basePower = troops * spt;
    const equipPower = safeNumber(econ.military?.equipPower, 0);
    const totalPower = Math.max(0, basePower + equipPower);

    dv("draft-display", Math.round(draftPct * 100) + "%");
    dv("draft-troops", formatCompactNumber(troops));
    dv("mil-power", formatCompactNumber(Math.round(totalPower)));
    dv("mil-troop-power", formatCompactNumber(Math.round(basePower)));
    dv("mil-equip-power", formatCompactNumber(Math.round(equipPower)));

    const perTroopUpk = safeNumber(econ.military?.upkeepPerTroopDaily, 0) * troops;
    const perEquipUpk = (safeNumber(econ.military?.upkeepPerEquipPowerAnnual, 0) / DAYS_IN_YEAR) * equipPower;
    const upkeepDay = perTroopUpk + perEquipUpk;
    dv("mil-upkeep", formatCompactNumber(upkeepDay * DAYS_IN_YEAR));
    dv("mil-upkeep-paid", formatCompactNumber(safeNumber(econ.last?.upkeepPaid, 0) * DAYS_IN_YEAR));
    dv("mil-upkeep-req", formatCompactNumber((safeNumber(econ.last?.upkeep, upkeepDay)) * DAYS_IN_YEAR));
    dv("mil-treasury", formatCompactNumber(econ.treasury));
    dv("mil-daily-income", formatCompactNumber(safeNumber(econ.last?.dailyIncome, dailyIncome) * DAYS_IN_YEAR));
    dv("mil-power-delta", formatCompactNumber(safeNumber(econ.last?.powerDelta, 0) * DAYS_IN_YEAR) + " /yr");
    dv("mil-readiness", (clamp01(econ.military.readiness ?? 0.7) * 100).toFixed(0) + "%");

    const netDay = econ.last?.net ?? (dailyIncome - upkeepDay - dailyIncome * clamp01(econ.military?.budgetPct ?? 0));
    dv("mil-net", formatCompactNumber(netDay * DAYS_IN_YEAR));
    dv("defense-budget-display", Math.round(clamp01(econ.military?.budgetPct ?? 0) * 100) + "%");
    dv("defense-planned-spend", formatCompactNumber(annualIncome * clamp01(econ.military?.budgetPct ?? 0)));

    // Readiness trend (yearly)
    const upk = safeNumber(econ.last?.upkeep, upkeepDay);
    const upkPaid = safeNumber(econ.last?.upkeepPaid, upk);
    const coverage = upk > 0 ? upkPaid / upk : 1;
    const driftYr = coverage < 1 ? -0.003 * (1 - coverage) * DAYS_IN_YEAR : 0.001 * DAYS_IN_YEAR;
    dv("mil-readiness-trend", (driftYr * 100).toFixed(1) + "% /yr");

    // also refresh diplomacy money displays if open
    dv("diplo-treasury", formatCompactNumber(econ.treasury));
    dv("diplo-revenue", formatCompactNumber(annualIncome));
  }

  [taxSlider, consSlider, invSlider].filter(Boolean).forEach((slider) =>
    slider.addEventListener("input", () => {
      normalizeSliders(slider);
      econ.taxRate = clamp01(safeNumber(taxSlider.value, 30) / 100);
      econ.cons = clamp01(safeNumber(consSlider.value, 35) / 100);
      econ.inv = clamp01(safeNumber(invSlider.value, 35) / 100);
      recalc();
    })
  );

  window.updateEconomy = recalc;
  recalc();
  updateClockDisplay();
}

/* =========================== Entrypoint =========================== */
export function startGame() {
  state.gameState = state.gameState || {};
  state.gameState.control = state.gameState.control || {};
  if (state.confirmedCountryId == null) {
    console.warn("[sidebar] No confirmedCountryId");
  }
  state.gameState.playerCountryId = state.confirmedCountryId ?? state.gameState.playerCountryId ?? 0;
  state.gameState.control[state.gameState.playerCountryId] =
    (Number.isFinite(state.gameState.control[state.gameState.playerCountryId])
      ? state.gameState.control[state.gameState.playerCountryId]
      : 100);

  resetSimulationDate();
  buildGameSidebar();
  updateClockDisplay();
}

/* ==================== Optional helper for timer =================== */
export function handleSimulationTick(days = 1) {
  if (typeof window.advanceEconomy === "function") window.advanceEconomy(days);
  if (typeof window.updateEconomy === "function") window.updateEconomy();
  updateClockDisplay();
}
