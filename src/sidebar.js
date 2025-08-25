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
import { mountLeaderboardContainer, updateLeaderboard, scheduleLeaderboardUpdate } from "./leaderboard.js";

const DAYS_IN_YEAR = 365;

/* ============================= Globals ============================= */
let econ = null; // economy + military live state

/* ============================== Utils ============================== */
const byId   = (id) => /** @type {HTMLElement|null} */ (document.getElementById(id));
const clamp01   = (x) => Math.max(0, Math.min(1, Number(x)));
const safeNumber= (n, fb = 0) => (Number.isFinite(+n) ? +n : fb);
const simDay = () => {
  const d = (typeof simulationDate !== "undefined" && simulationDate) ? simulationDate : new Date();
  return Math.floor(d.getTime() / 86400000);
};

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

/* ========================== Diplomacy state ======================== */
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
          trade: 1,
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
function stanceWord(score) {
  if (score >= 85) return "Allied";
  if (score >= 70) return "Friendly";
  if (score >= 55) return "Warm";
  if (score >= 45) return "Neutral";
  if (score >= 30) return "Cool";
  if (score >= 15) return "Hostile";
  return "Rival";
}

/* =============================== Tips ============================== */
(function setupUITooltips(){
  if (window.__gcTipsInit) return; // ensure once
  window.__gcTipsInit = true;

  const box = document.createElement("div");
  box.id = "ui-tooltip";
  box.setAttribute("role", "tooltip");
  Object.assign(box.style, {
    position: "fixed",
    zIndex: "9999",
    maxWidth: "260px",
    padding: "8px 10px 8px 10px",
    borderRadius: "6px",
    background: "rgba(20,20,25,0.95)",
    color: "#fff",
    fontSize: "12px",
    lineHeight: "1.35",
    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
    pointerEvents: "none",
    opacity: "0",
    transform: "translateY(-4px)",
    transition: "opacity 120ms ease, transform 120ms ease",
  });
  document.body.appendChild(box);

  let currentTarget = null;
  let hideTimer = null;

  function show(text, x, y) {
    if (!text) return;
    box.textContent = text;
    box.style.opacity = "1";
    box.style.transform = "translateY(0)";
    const margin = 12;
    const rect = box.getBoundingClientRect();
    const left = Math.min(window.innerWidth - rect.width - margin, Math.max(margin, (x ?? 0) + 12));
    const top  = Math.min(window.innerHeight - rect.height - margin, Math.max(margin, (y ?? 0) + 12));
    box.style.left = left + "px";
    box.style.top  = top + "px";
  }
  function hide() { box.style.opacity = "0"; box.style.transform = "translateY(-4px)"; }
  const findTipEl = (el) => el?.closest?.("[data-tip]") || null;

  document.addEventListener("mousemove", (e) => {
    const el = findTipEl(e.target);
    if (el) { currentTarget = el; clearTimeout(hideTimer); show(el.getAttribute("data-tip")||"", e.clientX, e.clientY); }
    else if (currentTarget) { currentTarget = null; hideTimer = setTimeout(hide, 60); }
  });
  document.addEventListener("focusin", (e) => {
    const el = findTipEl(e.target); if (!el) return;
    currentTarget = el; const r = el.getBoundingClientRect();
    show(el.getAttribute("data-tip")||"", r.left + r.width/2, r.top);
  });
  document.addEventListener("focusout", () => { if (currentTarget) hide(); });
  document.addEventListener("touchstart", (e) => {
    const el = findTipEl(e.target);
    if (el) { currentTarget = el; const r = el.getBoundingClientRect(); show(el.getAttribute("data-tip")||"", r.left + r.width/2, r.top); }
    else hide();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });

  // Public API
  window.tip = function tip(id, text) {
    const el = document.getElementById(id); if (!el) return;
    el.setAttribute("data-tip", String(text || ""));
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    el.setAttribute("aria-describedby", "ui-tooltip");
  };
  window.tipMany = function tipMany(map) {
    if (!map) return;
    for (const [id, text] of Object.entries(map)) window.tip(id, text);
  };
  window.untip = function untip(id) {
    const el = document.getElementById(id); if (!el) return;
    el.removeAttribute("data-tip"); el.removeAttribute("aria-describedby");
    if (el.getAttribute("tabindex") === "0") el.removeAttribute("tabindex");
  };
})();

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
/* ===== helpers (safe setters) ===== */
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = String(text); }
function setDisabled(id, disabled) {
  const el = document.getElementById(id); if (!el) return;
  if (disabled) el.setAttribute("disabled", ""); else el.removeAttribute("disabled");
}

/* ===== small helpers for War Room ===== */
function injectWarStylesOnce() {
  if (document.getElementById("war-room-css")) return;
  const style = document.createElement("style");
  style.id = "war-room-css";
  style.textContent = `
    #war-banner { 
      display:none; margin:8px 0 10px; padding:8px 10px; border-radius:6px; 
      font-weight:700; letter-spacing:.5px;
      background:#3a0; color:#fff; box-shadow:0 4px 10px rgba(0,0,0,.25);
      animation: warPulse 900ms ease-in-out 0s 3 alternate;
    }
    #war-banner.danger { background:#b20000; }
    @keyframes warPulse { from { transform:scale(1); } to { transform:scale(1.02); } }
    .war-item { border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:10px; margin-bottom:8px; background:rgba(255,255,255,.02); }
    .war-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
    .war-name { font-weight:700; }
    .war-tag { font-size:11px; padding:3px 6px; border-radius:4px; background:#b20000; color:#fff; font-weight:700; letter-spacing:.2px; }
    .bar { height:6px; background:rgba(255,255,255,.08); border-radius:4px; overflow:hidden; margin:6px 0 0; }
    .bar > span { display:block; height:100%; background:#ffb400; }
    .war-row { display:flex; gap:8px; align-items:center; justify-content:space-between; }
    .war-small { font-size:12px; opacity:.8; }
    .war-actions { display:flex; gap:6px; margin-top:8px; }
    .war-actions button { font-size:12px; padding:5px 8px; border-radius:4px; }
  `;
  document.head.appendChild(style);
}
function getControlShareAgainst(attackerId, defenderId) {
  if (typeof window.getWarControl === "function") {
    return clamp01(window.getWarControl(attackerId, defenderId));
  }
  // Fallback heuristic if war.js not loaded yet
  const ctrl = state.gameState?.control || {};
  const a = Math.max(0, safeNumber(ctrl[attackerId], 0));
  const b = Math.max(0, safeNumber(ctrl[defenderId], 0));
  const total = a + b;
  if (total <= 0) return 0.5;
  return Math.max(0, Math.min(1, a / total));
}

/* ===== build + wiring ===== */
function buildDiplomacy() {
  const el = byId("content-diplomacy"); if (!el) return;
  ensureDiplomacyState();
  injectWarStylesOnce();

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
      <button id="btn-diplo-denounce">Denounce (-10)</button>
      <button id="btn-diplo-aid">$50M Aid (+15)</button>
      <button id="btn-diplo-toggle-nap">Sign NAP</button>
      <button id="btn-diplo-toggle-alliance">Form Alliance</button>
      <button id="btn-diplo-toggle-war" class="danger">Declare War</button>
    </div>
    <small id="diplo-hint" class="muted"></small>
  </div>

  <!-- ===== War Room (always visible) ===== -->
  <div class="econ-card" id="war-room-card">
    <div class="card-header"><span>War Room</span></div>
    <div id="war-banner" class=""></div>
    <div id="war-list"></div>
    <small class="muted" id="war-room-empty" style="display:none;">No active wars. Select a country and declare war to begin.</small>
  </div>
</div>
`;

  // Map → Sidebar hook (map calls this on click)
  window.setSelectedCountry = function setSelectedCountry(id) {
    if (!id) return;
    state.gameState.selectedDiploTarget = String(id);
    renderDiplomacy();
  };

  // Optional: event-based selection
  document.addEventListener("gc:countrySelected", (ev) => {
    const id = String(ev?.detail?.id ?? "");
    if (id) window.setSelectedCountry(id);
  });

  // Button wiring
  byId("btn-diplo-improve")?.addEventListener("click", () => doImprove?.());
  byId("btn-diplo-denounce")?.addEventListener("click", () => doDenounce?.());
  byId("btn-diplo-aid")?.addEventListener("click", () => doAid?.());
  byId("btn-diplo-toggle-nap")?.addEventListener("click", () => toggleNAP?.());
  byId("btn-diplo-toggle-alliance")?.addEventListener("click", () => toggleAlliance?.());
  byId("btn-diplo-toggle-war")?.addEventListener("click", () => toggleWar?.());

  // Delegated clicks for war items
  byId("war-list")?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const foe = t.getAttribute("data-foe");
    if (!foe) return;
    if (t.matches(".war-focus")) {
      window.setSelectedCountry(foe);
      if (window.markDiploTarget) window.markDiploTarget(foe);
    } else if (t.matches(".war-offer-peace")) {
      const pid = String(state?.gameState?.playerCountryId ?? "");
      setRelSym(pid, foe, { atWar: false, score: Math.max(getRel(pid, foe).score, 20) });
      renderDiplomacy();
    }
  });

  // Tooltips for diplomacy (after DOM exists)
  registerDiplomacyTips();

  // First paint
  renderDiplomacy();
}

/* ===== War Room list ===== */

function flashWarBanner(text, danger = true) {
  const b = byId("war-banner");
  if (!b) return;
  b.className = danger ? "danger" : "";
  b.textContent = text;
  b.style.display = "block";
  setTimeout(() => { if (b) b.style.display = "none"; }, 2500);
}

/* ===== render (safe if econ is not initialised yet) ===== */
function renderDiplomacy() {
  const playerId = String(state?.gameState?.playerCountryId ?? "");
  const targetId = String(state?.gameState?.selectedDiploTarget ?? "");

  // Names
  const targetName = state.countryData?.[targetId]?.name ?? "—";
  setText("diplo-country-name", targetName);
  const targetLbl = document.getElementById("diplo-target-name");
  if (targetLbl) targetLbl.textContent = targetName;

  // Treasury & revenue (always visible; guard econ)
  const gdp = Number(econ?.GDP) || 0;
  const treasury = Number(econ?.treasury) || 0;
  const taxRate = Number(econ?.taxRate) || 0;
  const dailyIncome = gdp * taxRate / DAYS_IN_YEAR;
  const annualIncome = dailyIncome * DAYS_IN_YEAR;

  byId("diplo-treasury")?.replaceChildren(document.createTextNode(formatCompactNumber(treasury)));
  byId("diplo-revenue")?.replaceChildren(document.createTextNode(formatCompactNumber(annualIncome)));

  // No valid target
  if (!targetId || !state.countryData?.[targetId]) {
    ["diplo-stance","diplo-score","diplo-treaties","diplo-war","diplo-country-name","diplo-cost-improve"]
      .forEach(id => setText(id, "—"));
    ["btn-diplo-improve","btn-diplo-aid","btn-diplo-toggle-nap","btn-diplo-toggle-alliance","btn-diplo-toggle-war"]
      .forEach(id => setDisabled(id, true));
    setText("diplo-hint", "Click a country on the map to select a diplomacy target.");
    renderWarPanel();
    return;
  }

  // Self-target: neutral UI + disabled actions
  if (targetId === playerId) {
    setText("diplo-stance", "—");
    setText("diplo-score", "—");
    setText("diplo-treaties", "—");
    setText("diplo-war", "No");
    setText("diplo-cost-improve", "—");
    ["btn-diplo-improve","btn-diplo-aid","btn-diplo-toggle-nap","btn-diplo-toggle-alliance","btn-diplo-toggle-war"]
      .forEach(id => setDisabled(id, true));
    setText("diplo-hint", "Select a different country to conduct diplomacy.");
    renderWarPanel();
    return;
  }

  // Real target: pull relations
  ensureDiplomacyState();
  const R = getRel(playerId, targetId);

  // Costs (now safe even if econ wasn't initialised earlier)
  const improveCost = gdp * 0.02;  // 2% of GDP
  const aidCost     = gdp * 0.08;  // 8% of GDP

  setText("diplo-stance", stanceWord(R.score));
  setText("diplo-score", String(R.score));
  const treatiesStr = `${R.treaties.nap ? "NAP " : ""}${R.treaties.alliance ? "Alliance " : ""}`.trim() || "—";
  setText("diplo-treaties", treatiesStr);

  // NEW: War readout uses Control %, not exhaustion
  if (R.atWar) {
    const ctrlShare = getControlShareAgainst(playerId, targetId);
    setText("diplo-war", `Yes — Control: ${(ctrlShare*100|0)}%`);
  } else {
    setText("diplo-war", "No");
  }
  setText("diplo-cost-improve", formatCompactNumber(improveCost));

  // Button labels
  const bNap = byId("btn-diplo-toggle-nap");
  const bAll = byId("btn-diplo-toggle-alliance");
  const bWar = byId("btn-diplo-toggle-war");
  if (bNap) bNap.textContent = R.treaties.nap ? "Renounce NAP" : "Sign NAP";
  if (bAll) bAll.textContent = R.treaties.alliance ? "Leave Alliance" : "Form Alliance";
  if (bWar) bWar.textContent = R.atWar ? "Offer Peace" : "Declare War";

  // Enable/disable
  setDisabled("btn-diplo-improve", treasury < improveCost);
  setDisabled("btn-diplo-aid", treasury < aidCost);
  setDisabled("btn-diplo-toggle-nap", (!R.treaties.nap && R.score < 60));
  setDisabled("btn-diplo-toggle-alliance", (!R.treaties.alliance && (R.score < 80 || R.atWar)));
  setDisabled("btn-diplo-toggle-war", false);

  // Hint
  setText(
    "diplo-hint",
    R.treaties.alliance
      ? "Leaving an alliance reduces relations by 20."
      : "Improve relations to unlock NAPs (≥60) and Alliances (≥80). Declaring war sets relations to 0; peace restores to ~20."
  );

  renderWarPanel();
}

/* ===== diplomacy tooltips ===== */
function registerDiplomacyTips() {
  tipMany({
    "diplo-country-name": "Selected country (also shown at the top).",
    "diplo-cost-improve": "Cost to buy a +10 relations improvement (based on your GDP).",
    "diplo-stance": "Relationship stance from a 0–100 score (50 is neutral).",
    "diplo-score": "Current relations score (0–100).",
    "diplo-treaties": "Current treaties: Non-Aggression Pact or Alliance.",
    "diplo-war": "War status with the selected country. Shows your control if at war.",
    "diplo-treasury": "Your current treasury balance.",
    "diplo-revenue": "Estimated yearly government revenue.",
    "btn-diplo-improve": "Spend treasury to improve relations by +10.",
    "btn-diplo-aid": "Send financial aid to improve relations by +15.",
    "btn-diplo-toggle-nap": "Sign or renounce a Non-Aggression Pact (requires score ≥ 60).",
    "btn-diplo-toggle-alliance": "Form or leave an Alliance (requires score ≥ 80 and not at war).",
    "btn-diplo-toggle-war": "Declare war or offer peace.",
    "diplo-hint": "Tips and requirements for diplomacy actions.",
    "war-room-card": "Live status of active wars: control and yesterday’s losses.",
  });
}

/* ======== Diplomacy Actions ======== */
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
function doDenounce() {
  const pid = String(state?.gameState?.playerCountryId ?? "");
  const tid = String(state?.gameState?.selectedDiploTarget ?? "");
  if (!pid || !tid || pid === tid) return;
  const COST = 10_000_000; // $10M
  if (!spend(COST)) return;
  modRelScore(pid, tid, -10); // -10 relations
  renderDiplomacy();
}
function doAid() {
  const pid = String(state?.gameState?.playerCountryId ?? "");
  const tid = String(state?.gameState?.selectedDiploTarget ?? "");
  if (!pid || !tid || pid === tid) return;
  const COST = 50_000_000; // $50M
  if (!spend(COST)) return;
  modRelScore(pid, tid, +15);
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
  if (becomingAllied && (R.score < 60 || R.atWar)) return;
  R.treaties.alliance = becomingAllied;
  modRelScore(pid, tid, becomingAllied ? +10 : -20);
  setRelSym(pid, tid, { treaties: R.treaties, score: R.score });
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
    R.atWar = true;
    R.treaties.nap = false;
    R.treaties.alliance = false;
    R.trade = Math.max(0, (R.trade ?? 1) - 1);
    R.score = 0;
    // Flash banner
    const tname = state.countryData?.[tid]?.name || tid;
    flashWarBanner(`⚔️ WAR DECLARED on ${tname}`, true);
  } else {
    R.atWar = false;
    R.score = Math.max(R.score, 20);
    flashWarBanner(`Peace offered to ${state.countryData?.[tid]?.name || tid}`, false);
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

  // build the logic (sliders, recalc, etc.)
  initEconomyLogic();
  // attach tooltips AFTER the DOM exists
  registerEconomyTips();
}

// keep this OUTSIDE buildEconomy so it's defined once
function registerEconomyTips() {
  tip("stab-value", "Overall social stability.");
  tip("stab-growth", "Projected annual change in stability based on current tax rate.");

  tip("econ-gdp-total", "Total economic output from civilian labour (GDP).");
  tip("econ-gdp-growth", "Estimated annual GDP growth.");

  tip("econ-population", "Total population.");
  tip("econ-labour-force", "Civilians available to work. Draft reduces this share.");
  tip("econ-labour-productivity", "Output per worker.");
  tip("econ-treasury-total", "Treasury balance.");
  tip("tax-slider", "Tax rate.");
  tip("consumption-slider", "Consumption share.");
  tip("investment-slider", "Investment share.");
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

  // Tooltips
  (function registerMilitaryTips() {
    tip("mil-treasury", "Treasury for upkeep and procurement.");
    tip("mil-daily-income", "Estimated yearly revenue (annualized).");
    tip("mil-power", "Total military power = troop power + equipment power.");
    tip("mil-readiness", "Operational readiness.");
    tip("mil-upkeep", "Yearly cost to maintain troops and equipment.");
    tip("defense-budget-slider", "Share of revenue for defense.");
    tip("draft-slider", "Share of labour force conscripted.");
  })();

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

// === War Room Military Power readout ===============================

// Compact number formatting: 11680000 -> "11.68M", 4512000 -> "4.51M"
function _fmtCompact(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return Math.round(n).toString();
}

// Military power = explicit .military_power if defined, else infantry + equipment
function _getCountryPower(id) {
  const d = (state.countryData && state.countryData[id]) || {};
  let mp = Number(d.military_power);
  if (!Number.isFinite(mp) || mp <= 0) {
    const inf = Number(d.infantry)  || 0;
    const eq  = Number(d.equipment) || 0;
    mp = inf + eq;
  }
  return Math.max(0, mp);
}

function _getName(id) {
  return (state.countryData && state.countryData[id] && state.countryData[id].name) || id || "Unknown";
}

// Finds your War Room / Diplomacy card
function _findWarCard() {
  return document.getElementById("diplomacyCard") || document.querySelector(".diplomacy-card") || null;
}

// Heuristic: player id and currently focused/foe id.
// If your UI stores the foe somewhere else, add that here.
function _getPlayerId() {
  return state?.gameState?.playerCountryId || null;
}
function _getFoeId() {
  // Try a few common UI hooks you likely already have:
  return (state?.ui?.warTargetId) || (state?.ui?.selectedCountryId) || null;
}

// === Unified War Room renderer (shows Military Power, Control, Yesterday losses) ===
function renderWarPanel() {
  const list = byId("war-list");
  const emptyMsg = byId("war-room-empty");
  if (!list) return;

  const pid = String(state?.gameState?.playerCountryId ?? "");
  if (typeof ensureDiplomacyState === "function") ensureDiplomacyState();

  // helpers
  const fmt = (n) => {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return Math.round(n).toString();
  };
  const nameOf = (id) => state.countryData?.[id]?.name || id;
  const powerOf = (id) => {
    const d = state.countryData?.[id] || {};
    const mp = Number(d.military_power);
    if (Number.isFinite(mp) && mp > 0) return mp;
    return (Number(d.infantry) || 0) + (Number(d.equipment) || 0);
  };
  const controlShare = (a, b) => {
    if (typeof window.getControlShareAgainst === "function") return clamp01(window.getControlShareAgainst(a, b));
    if (typeof window.getWarControl === "function") return clamp01(window.getWarControl(a, b));
    return 0.5;
  };
  const lossesYesterday = (a, b) => {
    if (typeof window.getWarLosses === "function") return window.getWarLosses(a, b);
    return { ours:{inf:0,eq:0}, theirs:{inf:0,eq:0} };
  };
  const fmtLoss = (x) => `-${fmt(x)} ${x === 1 ? "troop" : "troops"}`;
  const fmtEq   = (x) => `-${fmt(x)} eq`;

  // gather all foes we are at war with (from our row)
  const wars = [];
  const myRow = state.diplomacy?.relations?.[pid] || {};
  for (const foe in myRow) {
    if (foe === pid) continue;
    if (myRow[foe]?.atWar) wars.push(foe);
  }

  list.innerHTML = "";
  if (wars.length === 0) {
    if (emptyMsg) emptyMsg.style.display = "block";
    return;
  }
  if (emptyMsg) emptyMsg.style.display = "none";

  for (const foe of wars) {
    const theirName = nameOf(foe);

    // NEW: military power row
    const myPow    = powerOf(pid);
    const theirPow = powerOf(foe);

    // control
    const cs   = controlShare(pid, foe); // our share 0..1
    const cYou = Math.round(cs * 100);
    const cThem= 100 - cYou;

    // yesterday losses
    const L = lossesYesterday(pid, foe);
    const ourLossTroops  = Number(L?.ours?.inf || 0);
    const ourLossEq      = Number(L?.ours?.eq  || 0);
    const theirLossTroops= Number(L?.theirs?.inf || 0);
    const theirLossEq    = Number(L?.theirs?.eq  || 0);

    const item = document.createElement("div");
    item.className = "war-item";
    item.innerHTML = `
      <div class="war-head">
        <div class="war-name">${theirName}</div>
        <div class="war-tag">AT WAR</div>
      </div>

      <div class="war-row war-small">
        <div>Military Power</div>
        <div>${fmt(myPow)} <span class="muted">you</span> · ${fmt(theirPow)} <span class="muted">them</span></div>
      </div>

      <div class="war-row war-small" style="margin-top:6px;">
        <div>Control</div>
        <div>${cYou}% <span class="muted">you</span> · ${cThem}% <span class="muted">them</span></div>
      </div>
      <div class="bar"><span style="width:${cYou}%"></span></div>

      <div class="war-row war-small" style="margin-top:6px;">
        <div>Yesterday</div>
        <div>
          ${fmtLoss(ourLossTroops)}, ${fmtEq(ourLossEq)} <span class="muted">you</span>
          &nbsp;·&nbsp;
          ${fmtLoss(theirLossTroops)}, ${fmtEq(theirLossEq)} <span class="muted">them</span>
        </div>
      </div>

      <div class="war-actions">
        <button class="war-focus" data-foe="${foe}">Focus</button>
        <button class="war-offer-peace" data-foe="${foe}">Offer Peace</button>
      </div>
    `;
    list.appendChild(item);
  }

  // optional: if you rely on delegated handlers elsewhere, you can remove this
  list.querySelectorAll(".war-focus").forEach(btn => {
    btn.onclick = () => {
      const foe = btn.getAttribute("data-foe");
      if (typeof focusCountry === "function") focusCountry(foe);
    };
  });
  list.querySelectorAll(".war-offer-peace").forEach(btn => {
    btn.onclick = () => {
      const foe = btn.getAttribute("data-foe");
      if (typeof offerPeaceTo === "function") offerPeaceTo(foe);
    };
  });
}



// Keep it fresh without needing to hook into your render pipeline
(function _installWarPowerTicker(){
  try {
    // Update once a second; cheap enough and robust to UI changes
    setInterval(_renderWarPowerBlock, 1000);
  } catch (e) {
    // If something goes wrong, fail silently
    console && console.debug && console.debug("war power ticker failed", e);
  }
})();

/* ===================== Economy + Sim Logic ====================== */
function initEconomyLogic() {
  // Elements exist because page just rendered
  const taxSlider = byId("tax-slider");
  const consSlider = byId("consumption-slider");
  const invSlider  = byId("investment-slider");

  // Sum-to-100 helper for CI sliders (optional)
  function normalizeSliders(changed) {
    if (!consSlider || !invSlider) return;
    if (!(changed === consSlider || changed === invSlider)) return;
    const total = safeNumber(consSlider.value, 35) + safeNumber(invSlider.value, 35);
    if (total <= 100) return;
    const remainder = 100;
    const sliders = [consSlider, invSlider];
    let acc = 0;
    sliders.forEach((s, idx) => {
      const raw = safeNumber(s.value, 50);
      const v = idx < sliders.length - 1 ? remainder - acc : Math.round(raw);
      s.value = String(Math.max(0, v));
      acc += v;
    });
  }

  // Seed from state (rough but stable)
  const pid = state?.gameState?.playerCountryId;
  const cd = state?.countryData?.[pid] || {};
  const pop0 = safeNumber(cd?.population, 1_000_000);
  const gdpReported = safeNumber(cd?.GDP, 100); // millions

  const taxInit = safeNumber(taxSlider?.value, 30) / 100;
  const consInit = safeNumber(consSlider?.value, 35) / 100;
  const invInit  = safeNumber(invSlider?.value,  35) / 100;

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

  window.getLiveCountrySnapshot = function getLiveCountrySnapshot() {
    if (!window || !econ) return null;
    return {
      name: (state.countryData?.[String(state?.gameState?.playerCountryId)]?.name) || "You",
      population: Number(econ.pop) || 0,
      GDP: Number(econ.GDP) || 0,
      militaryPower: Number(econ.military?.power) || 0,
    };
  };

  // derive productivity and GDP in game-units
  const GDP_units = gdpReported * 1e6;
  econ.productivity = Math.max(1, GDP_units / Math.max(1, econ.labourForce));
  econ.GDP = econ.labourForce * econ.productivity;

  // Defaults
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

    // growth rates (very simple)
    const rawStabRate = 0.3 - econ.taxRate;
    const stabRate = econ.stability < 1 ? rawStabRate : 0;
    econ.stability = clamp01(econ.stability + stabRate * (days / DAYS_IN_YEAR));

    const popRate  = econ.cons * 0.10 - 0.03;
    const prodRate = econ.inv  * 0.10 - 0.03;
    econ.pop += econ.pop * popRate * (days / DAYS_IN_YEAR);

    const draftPct = clamp01(econ.military?.draftPct ?? 0);
    const troops = (econ.labourForce / Math.max(1e-9, 1 - draftPct)) * draftPct;
    econ.labourForce = Math.max(0, econ.pop * 0.60 - troops);

    econ.productivity *= Math.pow(1 + prodRate, days / DAYS_IN_YEAR);
    econ.GDP = Math.max(0, econ.labourForce * econ.productivity);

    const dailyIncome = (econ.GDP * econ.taxRate) / DAYS_IN_YEAR;
    econ.treasury += dailyIncome * days;

    // --- military ---
    const strength = strengthFromProd(econ.productivity);
    const troopPower = troops * strength;
    const basePower = troopPower;
    let equipPower = Math.max(0, Number(econ.military?.equipPower ?? 0));
    const prevTotalPower = Math.max(0, (econ.military?.power ?? 0));

    const budgetPerDay = Math.max(0, econ.military?.budgetPct ?? 0) * dailyIncome;
    let budgetPool = budgetPerDay * days;

    const troopUpkPerDay = safeNumber(econ.military.upkeepPerTroopDaily, 50) * troops;
    const equipUpkPerDay = safeNumber(econ.military.upkeepPerEquipPowerAnnual, 100_000) / DAYS_IN_YEAR * equipPower;
    const requiredUpkeep = troopUpkPerDay + equipUpkPerDay;

    const upkeepPaid = Math.min(requiredUpkeep, budgetPool, Math.max(0, econ.treasury));
    budgetPool -= upkeepPaid;
    econ.treasury -= upkeepPaid;

    // Leftover budget goes to procurement
    const procurementSpend = Math.min(budgetPool, Math.max(0, econ.treasury));
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
        // --- SYNC for war system: keep countryData infantry/equipment up to date ---
    try {
      const pid = String(state.gameState?.playerCountryId ?? "");
      if (pid && state.countryData && state.countryData[pid]) {
        const cd = state.countryData[pid];

        // These two are already computed earlier in advanceEconomy:
        //   - troops  (drafted population)
        //   - equipPower (econ.military.equipPower)
        //   - strengthFromProd(...) is defined above

        const troopPower = Math.max(0, troops * strengthFromProd(econ.productivity)); // same unit as we use for “Troop Power”
        const equipPow   = Math.max(0, econ.military.equipPower);

        cd.infantry       = troopPower;
        cd.equipment      = equipPow;
        cd.military_power = troopPower + equipPow;
      }
    } catch (e) {
      // don’t crash the sim if something’s undefined early in boot
      console.warn("[econ→war sync] skipped", e);
    }
    // --- SYNC for war system: keep ALL countries infantry/equipment up to date ---
    try {
      for (const id in state.countryData) {
        const econ = state.economy?.[id];
        const cd   = state.countryData[id];
        if (!econ || !cd) continue;

        // Troop power from drafted service
        const troops = Number(econ.military?.service || 0);
        const troopPower = Math.max(0, troops * strengthFromProd(econ.productivity || 1));

        // Equipment power (you already compute/store this each tick)
        const equipPow = Math.max(0, econ.military?.equipPower || 0);

        cd.infantry       = troopPower;
        cd.equipment      = equipPow;
        cd.military_power = troopPower + equipPow;
      }
    } catch (e) {
      console.warn("[econ→war sync all countries] skipped", e);
    }
// --- end sync ---

    // --- end sync ---

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

    const strength = Math.sqrt(Math.max(econ.productivity, 1) / 100_000);
    const troopPower = troops * Math.max(0.25, Math.min(4, strength));
    const equipPower = Math.max(0, econ.military?.equipPower ?? 0);
    const totalPower = troopPower + equipPower;

    const upkeepDay = safeNumber(econ.military?.upkeepPerTroopDaily, 50) * troops
      + safeNumber(econ.military?.upkeepPerEquipPowerAnnual, 100_000) / DAYS_IN_YEAR * equipPower;

    const plannedDefense = safeNumber(econ.military?.budgetPct, 0.1) * dailyIncome;
    const powerDeltaYr = safeNumber(econ.last?.powerDelta, 0) * DAYS_IN_YEAR;

    dv("mil-treasury", formatCompactNumber(econ.treasury));
    dv("mil-daily-income", formatCompactNumber(annualIncome));
    dv("mil-power", formatCompactNumber(totalPower));
    dv("mil-power-delta", (powerDeltaYr >= 0 ? "+" : "") + formatCompactNumber(powerDeltaYr) + "/yr");
    dv("mil-readiness", Math.round(clamp01(econ.military?.readiness ?? 0.7) * 100) + "%");
    dv("mil-upkeep", formatCompactNumber(upkeepDay * DAYS_IN_YEAR) );
    dv("mil-upkeep-paid", formatCompactNumber(safeNumber(econ.last?.upkeepPaid, plannedDefense)));
    dv("mil-upkeep-req", formatCompactNumber(upkeepDay));
    dv("mil-net", formatCompactNumber(safeNumber(econ.last?.net, 0) * DAYS_IN_YEAR));
    dv("mil-troop-power", formatCompactNumber(troopPower));
    dv("mil-equip-power", formatCompactNumber(equipPower));

    // Readiness trend (yearly)
    const upk = safeNumber(econ.last?.upkeep, upkeepDay);
    const upkPaid = safeNumber(econ.last?.upkeepPaid, upk);
    const coverage = upk > 0 ? upkPaid / upk : 1;
    const driftYr = coverage < 1 ? -0.003 * (1 - coverage) * DAYS_IN_YEAR : 0.001 * DAYS_IN_YEAR;
    dv("mil-readiness-trend", (driftYr * 100).toFixed(1) + "% /yr");

    // also refresh diplomacy money displays if open
    dv("diplo-treasury", formatCompactNumber(econ.treasury));
    dv("diplo-revenue", formatCompactNumber(annualIncome));
    // slider readouts + effects
    dv("tax-rate-display", (econ.taxRate * 100).toFixed(0) + "%");
    dv("tax-stability-effect", (rawStabRate * 100).toFixed(2) + "% /yr");
    dv("tax-revenue-effect", formatCompactNumber(annualIncome));

    dv("consumption-display", (econ.cons * 100).toFixed(0) + "%");
    dv("ci-pop-effect", (popRate * 100).toFixed(2) + "% /yr");

    dv("investment-display", (econ.inv * 100).toFixed(0) + "%");
    dv("ci-prod-effect", (prodRate * 100).toFixed(2) + "% /yr");
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
  state.gameState.selectedDiploTarget = state.gameState.selectedDiploTarget || null;

  // Give the player a starting control bucket if not set
  state.gameState.control[state.gameState.playerCountryId] =
    (Number.isFinite(state.gameState.control[state.gameState.playerCountryId])
      ? state.gameState.control[state.gameState.playerCountryId]
      : 100);

  resetSimulationDate();
  buildGameSidebar();
  updateClockDisplay();
  mountLeaderboardContainer();
  updateLeaderboard();
}

/* ==================== Optional helper for timer =================== */
export function handleSimulationTick(days = 1) {
  if (typeof window.advanceEconomy === "function") window.advanceEconomy(days);
  if (typeof window.updateEconomy === "function") window.updateEconomy();
  if (typeof window.stepAI === "function") window.stepAI(days);
  if (window.updateDiplomacyStyles) window.updateDiplomacyStyles();
  if (window.updateWarLines) window.updateWarLines();
  scheduleLeaderboardUpdate(); // throttled refresh
  updateClockDisplay();
  // Keep War Room fresh during sim
  renderWarPanel();
}
window.handleSimulationTick = handleSimulationTick;