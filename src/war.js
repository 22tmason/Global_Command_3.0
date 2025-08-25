// war.js — RAW POWER ONLY version.
// Territory & losses depend solely on raw military power from `military_power`.
// Posture, readiness, and overclock costs are ignored (kept as no-op stubs for UI).
import { state } from "./state.js";

/*
  Public (global) helpers exported at bottom:

    stepWar(days=1)                 // advance wars
    getWarControl(a,b)              // our control share vs b (0..1)
    getWarLosses(a,b)               // { ours:{inf,eq}, theirs:{inf,eq} } (yesterday)
    getPosture(id)                  // no-op (always 0.5)
    setPosture(id, value)           // no-op
    setOverclockMu(mu)              // no-op
    getWarExhaustion(id)            // 0 (compat for older UI)
*/

const CFG = {
  // CONTROL: ΔC = controlStepPerDay * (2*shareA - 1), capped per day
  controlStepPerDay: 1.5,
  maxDailyControlMove: 1.0,

  // LOSSES: per day we destroy this share of TOTAL raw power on the field
  intensityPerPower: 0.002,   // higher = bloodier

  // Split infantry vs equipment in the daily loss
  infFrac: 0.60,

  // Annexation salvage
  captureEqRatio: 0.35,       // winner captures this share of remaining eq
  annexGDPKeepLoser: 0.10,    // loser retains this fraction of GDP & Pop
  stabHitPerInf: 1e-7,        // tiny stability penalty per infantry lost
};

const war = {
  // pairKey -> { a, b, control(0..100, 50 start), last:{[id]:{inf,eq}} }
  pairs: Object.create(null),
  // posture kept only for compatibility; not used in calculations
  posture: Object.create(null),
};

function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function clamp01(x){ return clamp(Number(x)||0, 0, 1); }
function keyFor(a,b){ return (a < b) ? `${a}|${b}` : `${b}|${a}`; }

function ensurePair(a, b){
  const k = keyFor(a,b);
  let p = war.pairs[k];
  if (!p) {
    const [aa, bb] = (a < b) ? [a,b] : [b,a];
    p = war.pairs[k] = { a: aa, b: bb, control: 50, last: { [aa]:{inf:0,eq:0}, [bb]:{inf:0,eq:0} } };
  }
  return p;
}

function ensurePools(id){
  const d = state.countryData[id] || (state.countryData[id] = {});
  if (Number.isFinite(+d.infantry))  d.infantry  = Math.max(0, +d.infantry);
  if (Number.isFinite(+d.equipment)) d.equipment = Math.max(0, +d.equipment);
  d.military_power = Math.max(0, Number(d.military_power) || 0);
  return d;
}

function annex(winnerId, loserId){
  const W = ensurePools(winnerId);
  const L = ensurePools(loserId);

  // capture some equipment
  const L_eq = Math.max(0, Number(L.equipment) || 0);
  const cap = L_eq * CFG.captureEqRatio;
  if (Number.isFinite(+W.equipment)) {
    W.equipment += cap;
  } else if (cap > 0) {
    W.equipment = cap;
  }
  L.equipment = Math.max(0, L_eq - cap);
  W.military_power = Math.max(0, W.military_power + cap);

  // fold economy & population
  const keep = clamp01(CFG.annexGDPKeepLoser);
  if (Number.isFinite(+W.GDP) && Number.isFinite(+L.GDP)) {
    W.GDP += L.GDP * (1 - keep);
    L.GDP *= keep;
  }
  if (Number.isFinite(+W.population) && Number.isFinite(+L.population)) {
    W.population += L.population * (1 - keep);
    L.population *= keep;
  }

  // treasury transfer
  if (Number.isFinite(+W.treasury) && Number.isFinite(+L.treasury)) {
    const take = L.treasury * 0.5;
    W.treasury += take;
    L.treasury -= take;
  }

  // disarm loser
  L.infantry = 0; L.equipment = 0; L.military_power = 0;

  // end war diplomatically
  const A = state.diplomacy?.relations?.[winnerId]?.[loserId];
  const B = state.diplomacy?.relations?.[loserId ]?.[winnerId];
  if (A && B) { A.atWar = false; B.atWar = false; A.score = Math.max(25, A.score||0); B.score = Math.max(15, B.score||0); }

  // clear record
  const k = keyFor(winnerId, loserId);
  delete war.pairs[k];

  if (window.scheduleWarLinesUpdate) window.scheduleWarLinesUpdate();
  if (window.scheduleLeaderboardUpdate) window.scheduleLeaderboardUpdate();
}

/** One day of combat for pair (RAW POWER ONLY) */
function resolvePairDay(a, b, days=1){
  const p = ensurePair(a,b);
  const { a: A, b: B } = p;

  const dA = ensurePools(A);
  const dB = ensurePools(B);

  const PA = dA.military_power; // raw power
  const PB = dB.military_power;
  if (PA <= 0 && PB <= 0) return;

  // CONTROL: strictly raw power share
  const total = Math.max(1e-6, PA + PB);
  const shareA = PA / total;              // 0..1
  let dC = CFG.controlStepPerDay * (2 * shareA - 1) * days;
  const cap = Math.max(0, CFG.maxDailyControlMove) * Math.sign(dC || 1);
  if (Math.abs(dC) > Math.abs(cap)) dC = cap;

  // LOSSES: total losses proportional to total power; each side loses
  // proportionally to the OTHER side's share (bigger foe makes you lose more).
  const L_total = CFG.intensityPerPower * (PA + PB) * days;
  const lossA_power = L_total * (1 - shareA); // A loses opposite share
  const lossB_power = L_total * shareA;       // B loses opposite share

  const A_infLoss = lossA_power * CFG.infFrac;
  const A_eqLoss  = lossA_power * (1 - CFG.infFrac);
  const B_infLoss = lossB_power * CFG.infFrac;
  const B_eqLoss  = lossB_power * (1 - CFG.infFrac);

  // apply losses
  dA.military_power = Math.max(0, dA.military_power - lossA_power);
  dB.military_power = Math.max(0, dB.military_power - lossB_power);
  if (Number.isFinite(+dA.infantry))  dA.infantry  = Math.max(0, dA.infantry  - A_infLoss);
  if (Number.isFinite(+dA.equipment)) dA.equipment = Math.max(0, dA.equipment - A_eqLoss);
  if (Number.isFinite(+dB.infantry))  dB.infantry  = Math.max(0, dB.infantry  - B_infLoss);
  if (Number.isFinite(+dB.equipment)) dB.equipment = Math.max(0, dB.equipment - B_eqLoss);

  // light societal effects
  if (Number.isFinite(+dA.population)) dA.population = Math.max(0, dA.population - A_infLoss);
  if (Number.isFinite(+dB.population)) dB.population = Math.max(0, dB.population - B_infLoss);
  if (Number.isFinite(+dA.stability)) dA.stability = clamp01((dA.stability ?? 0.6) - A_infLoss * CFG.stabHitPerInf);
  if (Number.isFinite(+dB.stability)) dB.stability = clamp01((dB.stability ?? 0.6) - B_infLoss * CFG.stabHitPerInf);

  // store "yesterday" losses for UI
  p.last[A] = { inf: A_infLoss, eq: A_eqLoss };
  p.last[B] = { inf: B_infLoss, eq: B_eqLoss };

  // apply control & annex
  p.control = clamp(p.control + dC, 0, 100);
  if (p.control <= 0) { annex(B, A); return; }   // B annexes A
  if (p.control >= 100){ annex(A, B); return; }  // A annexes B
}

/** Iterate all relations and resolve wars (either side atWar -> normalize & fight) */
export function stepWar(days = 1){
  const relRoot = state.diplomacy?.relations;
  if (!relRoot) return;

  // collect all ids seen in relations (top & child)
  const idSet = new Set();
  for (const a in relRoot) {
    idSet.add(a);
    const row = relRoot[a] || {};
    for (const b in row) idSet.add(b);
  }
  if (!idSet.size) return;

  const ids = Array.from(idSet);
  const handled = new Set();

  for (let i = 0; i < ids.length; i++){
    const a = ids[i];
    const row = relRoot[a] || {};
    for (const b in row){
      if (a === b) continue;
      const key = keyFor(a,b);
      if (handled.has(key)) continue;
      handled.add(key);

      // ensure mirrors exist
      relRoot[a] = relRoot[a] || {};
      relRoot[b] = relRoot[b] || {};
      const relAB = (relRoot[a][b] = relRoot[a][b] || { score: 0, atWar: false });
      const relBA = (relRoot[b][a] = relRoot[b][a] || { score: 0, atWar: false });

      // fight if either side flags atWar; normalize to both true
      if (!(relAB.atWar || relBA.atWar)) continue;
      relAB.atWar = relBA.atWar = true;

      ensurePair(a,b);
      resolvePairDay(a, b, days);
    }
  }

  if (window.scheduleWarLinesUpdate) window.scheduleWarLinesUpdate();
  if (window.scheduleLeaderboardUpdate) window.scheduleLeaderboardUpdate();
}

/* ===== UI helpers ===== */
function _getPair(a,b){
  const k = keyFor(a,b);
  const p = war.pairs[k];
  return p || null;
}

export function getWarControl(a, b){
  const p = _getPair(a,b);
  if (!p) return 0.5;
  const shareA = p.control / 100;
  return (a === p.a) ? shareA : (1 - shareA);
}

export function getWarLosses(a, b){
  const p = _getPair(a,b);
  if (!p) return { ours:{inf:0,eq:0}, theirs:{inf:0,eq:0} };
  const oursId   = a;
  const theirsId = (a === p.a) ? p.b : p.a;
  const last = p.last || {};
  return {
    ours:   { inf: Number(last[oursId]?.inf || 0),   eq: Number(last[oursId]?.eq || 0) },
    theirs: { inf: Number(last[theirsId]?.inf || 0), eq: Number(last[theirsId]?.eq || 0) },
  };
}

/* ===== Compatibility stubs (posture/exhaustion/overclock not used) ===== */
export function getPosture(){ return 0.5; }
export function setPosture(){ /* no-op */ }
export function setOverclockMu(){ /* no-op */ }
export function getWarExhaustion(){ return 0; }

/* expose to window for other modules */
window.stepWar           = stepWar;
window.getWarControl     = getWarControl;
window.getWarLosses      = getWarLosses;
window.getPosture        = getPosture;
window.setPosture        = setPosture;
window.setOverclockMu    = setOverclockMu;
window.getWarExhaustion  = getWarExhaustion;
