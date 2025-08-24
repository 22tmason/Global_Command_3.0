// war.js — Exhaustion, Equipment Attrition, Draft KIA, Control %, Annexation
// Integrates with: state.diplomacy.relations[a][b].atWar, timer -> window.stepWar(days)
// Optional UI hooks: window.scheduleWarLinesUpdate(), window.scheduleLeaderboardUpdate()
// Data hooks exposed: window.getWarExhaustion(id), window.getWarControl(winner, loser)

import { state } from "./state.js";

/* ------------------------------------------------------------------ */
/* Constants & Local State                                             */
/* ------------------------------------------------------------------ */
const DAYS_IN_YEAR = 365;

const war = {
  // Per-country transient stats
  // id -> { exhaustion: 0..1, lastTickDay: number }
  stats: Object.create(null),

  // Active war pairs (for speed); key "A|B" (sorted) -> { a, b, startedOn, lastTick }
  pairs: Object.create(null),

  // Control progress: "winner>loser" -> 0..100
  control: Object.create(null),
};

/* Tunables (feel free to tweak) */
const T = {
  // Intensity per day at parity (bounded)
  intensityBasePerDay: 0.002,
  intensityMaxPerDay:  0.010,

  // How much readiness/exhaustion skew intensity
  readinessEdge: 0.40,
  moraleEdge:    0.30,

  // Peace / annex thresholds
  surrenderAt:  0.85,  // exhaustion threshold that *allows* forced peace if you still keep it
  annexControl: 100,   // % control required to annex

  // Control swing
  controlStep:  1.5,   // base percentage points per decisive day (scaled by intensity & advantage)

  // Losses (per 1.0 intensity *per day*)
  equipLossPerIntensity:     0.015, // % of equipment pool
  draftedKIAperIntensity:    0.010, // % of drafted pool
  minDailyEquipLoss:         0.0002,
  minDailyDraftLoss:         0.0001,

  // Annex assimilation fractions
  annexGDPtake:   1.00,   // take all remaining GDP
  annexPOPtake:   1.00,   // take all remaining population
  annexTreasury:  1.00,   // take all treasury

  // Post-annex capture/levy fractions
  captureEquipFrac: 0.35,
  captureDraftFrac: 0.10,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function simDay() {
  const d = (typeof window.simulationDate !== "undefined" && window.simulationDate) ? window.simulationDate : new Date();
  return Math.floor(d.getTime() / 86400000);
}
function keyAB(a,b){ return a < b ? `${a}|${b}` : `${b}|${a}`; }
function keyCtl(winner,loser){ return `${winner}>${loser}`; }
function clamp01(x){ return x < 0 ? 0 : (x > 1 ? 1 : x); }
function clampCtl(x){ return Math.max(0, Math.min(T.annexControl, x)); }

function stats(id){
  return (war.stats[id] ||= { exhaustion: 0, lastTickDay: simDay() });
}

function ensureCountry(id){
  const d = (state.countryData ||= {})[id] ||= {};
  d.name       ||= id;
  d.population  = Number.isFinite(d.population) ? d.population : 5_000_000;
  d.GDP         = Number.isFinite(d.GDP)        ? d.GDP        : 200; // “billions / millions” as per your dataset use
  d.treasury    = Number.isFinite(d.treasury)   ? d.treasury   : 0;
  d.stability   = Number.isFinite(d.stability)  ? d.stability  : 0.6;
  ensureMilitary(id);
  return d;
}
function ensureMilitary(id){
  const d = ensureCountry(id);
  const m = (d.military ||= {});
  m.equipment = Number.isFinite(m.equipment) ? m.equipment : 1_000_000; // abstract pieces
  m.drafted   = Number.isFinite(m.drafted)   ? m.drafted   : Math.floor(d.population * 0.01);
  m.readiness = Math.min(1, Math.max(0, Number.isFinite(m.readiness) ? m.readiness : 0.7));
  // “power” proxy (doesn’t need to match leaderboard’s; this is internal combat power)
  m.power     = Number.isFinite(m.power) ? m.power : Math.max(1, Math.sqrt(m.equipment)) * (0.5 + 0.5*m.readiness);
  return m;
}

/* Read current “atWar” pairs from the diplomacy matrix (UI toggles these) */
function currentWarPairsFromRelations(){
  const rel = state?.diplomacy?.relations || {};
  const out = [];
  for (const a in rel){
    for (const b in rel[a]){
      if (a < b && rel[a][b]?.atWar) out.push({ a, b, k: keyAB(a,b) });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
export function startWar(a, b){
  if (!a || !b || a === b) return false;
  ensureCountry(a); ensureCountry(b);
  const k = keyAB(a,b);
  if (war.pairs[k]) return true;
  war.pairs[k] = { a, b, startedOn: simDay(), lastTick: simDay() };
  // seed both control tracks (so fronts can flip)
  war.control[keyCtl(a,b)] ||= 0;
  war.control[keyCtl(b,a)] ||= 0;
  mobilize(a); mobilize(b);
  scheduleMapAndBoards();
  return true;
}
export function endWar(a, b){
  const k = keyAB(a,b);
  if (!war.pairs[k]) return false;
  delete war.pairs[k];
  scheduleMapAndBoards();
  return true;
}

/* Exhaustion/Control getters for UI/econ */
export function getExhaustion(id){ return stats(id).exhaustion; }
export function getControlPercent(winner, loser){ return Math.round(war.control[keyCtl(winner, loser)] || 0); }

/* Expose to window so timer & UI can call these without imports */
window.stepWar          = stepWar;
window.getWarExhaustion = getExhaustion;
window.getWarControl    = getControlPercent;
window.startWar         = startWar;
window.endWar           = endWar;

/* ------------------------------------------------------------------ */
/* Core daily step                                                     */
/* ------------------------------------------------------------------ */
export function stepWar(days = 1){
  if (!days || days <= 0) return;

  // 0) Sync war.pairs with diplomacy matrix (the UI already flips atWar). This
  //    makes the engine robust even if nobody calls startWar() manually.  :contentReference[oaicite:3]{index=3}
  const active = currentWarPairsFromRelations();
  const activeKeys = new Set();
  for (const {a,b,k} of active){
    activeKeys.add(k);
    if (!war.pairs[k]) startWar(a,b);
  }
  // Remove pairs that are no longer atWar in diplomacy
  for (const k of Object.keys(war.pairs)){
    if (!activeKeys.has(k)) delete war.pairs[k];
  }

  // 1) Resolve each active front
  for (const k of Object.keys(war.pairs)){
    const W = war.pairs[k];
    const { a, b } = W;
    resolvePairDay(a, b, days);
    checkAnnex(a, b);
    checkAnnex(b, a);
  }

  // 2) UI paint
  scheduleMapAndBoards();
}

/* ------------------------------------------------------------------ */
/* Pair resolution                                                     */
/* ------------------------------------------------------------------ */
function resolvePairDay(a, b, days){
  ensureCountry(a); ensureCountry(b);
  const ma = ensureMilitary(a), mb = ensureMilitary(b);

  // Update “power” proxies (this file’s internal calculation)
  ma.power = Math.max(1, Math.sqrt(ma.equipment)) * (0.5 + 0.5*ma.readiness);
  mb.power = Math.max(1, Math.sqrt(mb.equipment)) * (0.5 + 0.5*mb.readiness);

  // Edges
  const ratioAB = Math.max(0.2, Math.min(5, ma.power / Math.max(1, mb.power)));
  const ra = ma.readiness, rb = mb.readiness;
  const exa = stats(a).exhaustion, exb = stats(b).exhaustion;

  // Daily intensity
  let intensity = T.intensityBasePerDay;
  intensity *= (0.6 + 0.4 * Math.min(ratioAB, 1/ratioAB)); // parity fights more
  intensity *= (1 + T.readinessEdge * (ra - rb));
  intensity *= (1 + T.moraleEdge    * ((1-exa) - (1-exb)));
  intensity = Math.min(T.intensityMaxPerDay, Math.max(0, intensity));

  // Apply N days at once (percentage-based so stable)
  applyLosses(a, b, intensity, days);

  // Control swing (log makes it symmetric around 1.0)
  const swing = controlSwing(ratioAB, ra, rb, exa, exb, intensity, days);
  if (swing > 0){
    war.control[keyCtl(a,b)] = clampCtl((war.control[keyCtl(a,b)] || 0) + swing);
    war.control[keyCtl(b,a)] = clampCtl((war.control[keyCtl(b,a)] || 0) - swing * 0.5);
  } else if (swing < 0){
    const s = Math.abs(swing);
    war.control[keyCtl(b,a)] = clampCtl((war.control[keyCtl(b,a)] || 0) + s);
    war.control[keyCtl(a,b)] = clampCtl((war.control[keyCtl(a,b)] || 0) - s * 0.5);
  }

  // Exhaustion builds with sustained intensity
  stats(a).exhaustion = clamp01(exa + 0.8*intensity*days);
  stats(b).exhaustion = clamp01(exb + 0.8*intensity*days);

  // Optional: if you still want non-annex peaces when exhausted, you can
  //           add a peace path here (we leave annex as the “hard end”). :contentReference[oaicite:4]{index=4}
}

/* Loss application (equipment attrition + drafted KIA + readiness stress) */
function applyLosses(a, b, intensityPerDay, days){
  const ma = ensureMilitary(a), mb = ensureMilitary(b);

  const eRate = Math.max(T.minDailyEquipLoss, T.equipLossPerIntensity * intensityPerDay);
  const dRate = Math.max(T.minDailyDraftLoss, T.draftedKIAperIntensity * intensityPerDay);

  // Compound over N days
  const equipLossA = 1 - Math.pow(1 - eRate, days);
  const equipLossB = 1 - Math.pow(1 - eRate, days);
  const draftLossA = 1 - Math.pow(1 - dRate, days);
  const draftLossB = 1 - Math.pow(1 - dRate, days);

  // Weaker side bleeds a bit more
  const pa = Math.max(1, ma.power), pb = Math.max(1, mb.power);
  const tiltA = pa < pb ? 1.20 : 0.85;
  const tiltB = pb < pa ? 1.20 : 0.85;

  const newEquipA = Math.max(0, ma.equipment - ma.equipment * equipLossA * tiltA);
  const newEquipB = Math.max(0, mb.equipment - mb.equipment * equipLossB * tiltB);
  const kiaA      = Math.min(ma.drafted, Math.round(ma.drafted * draftLossA * tiltA));
  const kiaB      = Math.min(mb.drafted, Math.round(mb.drafted * draftLossB * tiltB));

  ma.equipment = newEquipA;
  mb.equipment = newEquipB;
  ma.drafted  -= kiaA;
  mb.drafted  -= kiaB;

  // Readiness degrades under loss stress
  const stressA = (kiaA / Math.max(1, ma.drafted + kiaA)) + (equipLossA * tiltA);
  const stressB = (kiaB / Math.max(1, mb.drafted + kiaB)) + (equipLossB * tiltB);
  ma.readiness  = Math.max(0, ma.readiness - 0.10 * stressA);
  mb.readiness  = Math.max(0, mb.readiness - 0.10 * stressB);
}

/* Control dynamics */
function controlSwing(ratioAB, ra, rb, exa, exb, intensity, days){
  const advantage    = Math.log(ratioAB); // sign from advantage
  const readinessGap = (ra - rb);
  const moraleGap    = ((1-exa) - (1-exb));
  const base         = T.controlStep * intensity * days * (1 + 0.6*readinessGap + 0.5*moraleGap);
  return base * advantage;
}

/* Annexation at 100% control */
function checkAnnex(winner, loser){
  const ctl = war.control[keyCtl(winner, loser)] || 0;
  if (ctl < T.annexControl) return;

  const dW = ensureCountry(winner);
  const dL = ensureCountry(loser);

  // Economic absorption
  const gTake = (dL.GDP || 0) * T.annexGDPtake;
  const pTake = Math.round((dL.population || 0) * T.annexPOPtake);
  const tTake = (dL.treasury || 0) * T.annexTreasury;

  dW.GDP        += gTake;
  dW.population += pTake;
  dW.treasury   += tTake;

  dL.GDP        = Math.max(0, (dL.GDP || 0) - gTake);
  dL.population = Math.max(0, (dL.population || 0) - pTake);
  dL.treasury   = Math.max(0, (dL.treasury || 0) - tTake);

  // Military capture/levies
  const mW = ensureMilitary(winner);
  const mL = ensureMilitary(loser);
  mW.equipment += Math.floor(mL.equipment * T.captureEquipFrac);
  mW.drafted   += Math.floor(mL.drafted   * T.captureDraftFrac);
  mL.equipment  = 0;
  mL.drafted    = 0;

  // Mark, clean, and end war
  dL.annexedBy = winner;
  dL.stability = Math.max(0, (dL.stability || 0) - 0.15); // conquered unrest
  dW.stability = Math.max(0, (dW.stability || 0) - 0.04); // occupation drag

  // Remove pairing and control tracks both ways
  const k = keyAB(winner, loser);
  delete war.pairs[k];
  delete war.control[keyCtl(winner, loser)];
  delete war.control[keyCtl(loser, winner)];

  // Reflect in diplomacy matrix: not at war anymore
  if (state?.diplomacy?.relations?.[winner]?.[loser]){
    state.diplomacy.relations[winner][loser].atWar = false;
    state.diplomacy.relations[loser][winner].atWar = false;
    // bump relations a little above rock bottom after annex (optional)
    state.diplomacy.relations[winner][loser].score = Math.max(20, state.diplomacy.relations[winner][loser].score || 0);
    state.diplomacy.relations[loser][winner].score = Math.max(20, state.diplomacy.relations[loser][winner].score || 0);
  }

  scheduleMapAndBoards();
}

/* Mobilization on war start (spikes readiness; dents stability slightly) */
function mobilize(id){
  const d = ensureCountry(id);
  const m = ensureMilitary(id);
  m.readiness = Math.min(1, m.readiness + 0.12);
  d.stability = Math.max(0, (d.stability || 0.6) - 0.03);
}

/* UI helpers — repaint war lines & leaderboard if those are wired */
function scheduleMapAndBoards(){
  if (typeof window.scheduleWarLinesUpdate    === "function") window.scheduleWarLinesUpdate();   // map war links  :contentReference[oaicite:5]{index=5}
  if (typeof window.scheduleLeaderboardUpdate === "function") window.scheduleLeaderboardUpdate(); // top-right list
}
