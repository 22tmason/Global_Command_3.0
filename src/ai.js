// ai.js — Personas + Economy + Neighbor-Biased War Planning (smooth + capped)
import { state } from "./state.js";

/* ===================== Config ===================== */
const DAYS_IN_YEAR = 365;

// Economy cadence (per country)
const AI_ECON_STEP_DAYS = 1;        // apply econ every N sim-days

// Diplomacy cadence (across ALL AIs)
const DIPLO_SLICE_PER_DAY = 10;     // #countries that run diplomacy each day (spread load)

// War behavior
const WAR_DELAY_DAYS   = 7;         // baseline denounce -> declare wait (persona can scale this)
const MAX_WARS_PER_AI  = 1;         // cap wars per country
const GLOBAL_WAR_CAP   = 20;        // hard global cap (across all AIs)

// Target selection thresholds
const HOSTILITY_CUTOFF = 28;        // relations ≤ cutoff -> viable enemy
const RATIO_TO_BULLY   = 1.12;      // baseline power ratio to feel strong enough (persona can loosen)

/* ===================== Internal AI state ===================== */
const ai = {
  econById: Object.create(null),
  ids: [],
  rels: null,                // alias to state.diplomacy.relations
  diploCursor: 0,            // rotating index for diplomacy slices
  GLOBAL_WAR_COUNT: 0        // O(1) global war counter
};

/* ===================== Personas ===================== */
const PERSONAS = {
  balanced: { tax: 0.28, cons: 0.62, inv: 0.38, def: 0.08, draft: 0.03, aggression: 0.20, volatility: 0.02 },
  growth:   { tax: 0.27, cons: 0.60, inv: 0.40, def: 0.06, draft: 0.02, aggression: 0.10, volatility: 0.02 },
  hawk:     { tax: 0.30, cons: 0.59, inv: 0.33, def: 0.12, draft: 0.05, aggression: 0.35, volatility: 0.02 },
  volatile: { tax: 0.27, cons: 0.60, inv: 0.40, def: 0.09, draft: 0.03, aggression: 0.25, volatility: 0.06 },
};
const PERSONA_KEYS = Object.keys(PERSONAS);
function personaKeyFor(id){
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return PERSONA_KEYS[h % PERSONA_KEYS.length];
}

// persona modifiers
function personaAggroMult(p){
  const k = (p?.aggression ?? 0.2);
  if (p === PERSONAS.hawk)     return 2.0 * (1 + k);
  if (p === PERSONAS.growth)   return 0.6 * (1 + 0.5*k);
  if (p === PERSONAS.volatile) return 1.4 * (1 + k);
  return 1.0 * (1 + 0.5*k);
}
function personaDelayMult(p){
  if (p === PERSONAS.hawk)     return 0.6;
  if (p === PERSONAS.growth)   return 1.5;
  if (p === PERSONAS.volatile) return 0.8;
  return 1.0;
}
function personaRatioSlack(p){
  if (p === PERSONAS.hawk)     return 0.00;  // wants advantage
  if (p === PERSONAS.growth)   return -0.05; // retaliates at parity
  if (p === PERSONAS.volatile) return 0.08;  // will attack even if only slightly stronger
  return 0.00;
}

/* ===================== Geo helpers ===================== */
function neighborsOf(id){
  return (state.geo?.neighbors?.[id]) || [];
}

/* ===================== Time helper ===================== */
function simDay(){
  const sd = state?.gameState?.simDay;
  if (typeof sd === "number") return sd;
  const d = (typeof window.simulationDate !== "undefined" && window.simulationDate) ? window.simulationDate : new Date();
  return Math.floor(d.getTime() / 86400000);
}

/* ===================== Diplomacy matrix ===================== */
function ensureDiplo(){
  state.diplomacy = state.diplomacy || { relations: {} };
  return state.diplomacy.relations;
}
function relAB(a,b){
  const R = ensureDiplo();
  R[a] = R[a] || {};
  R[b] = R[b] || {};
  R[a][b] = R[a][b] || { score: 50, treaties: { nap:false, alliance:false }, atWar:false, trade:1 };
  R[b][a] = R[b][a] || { score: 50, treaties: { nap:false, alliance:false }, atWar:false, trade:1 };
  return [R[a][b], R[b][a]];
}
function initDiplomacyMatrixOnce(){
  const R = ensureDiplo();
  const ids = Object.keys(state.countryData || {});
  for (let i = 0; i < ids.length; i++){
    for (let j = 0; j < ids.length; j++){
      const a = ids[i], b = ids[j];
      if (a !== b) relAB(a,b);
    }
  }
  ai.rels = R;
}

/* ===================== Rivalries ===================== */
function hashInt(str, mod){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) h = (h ^ str.charCodeAt(i)) * 16777619 >>> 0;
  return (h % mod) | 0;
}
function seedRivalries(ids, perCountry = 2){
  for (const a of ids){
    for (let k = 0; k < perCountry; k++){
      const idx = (hashInt(a + ":" + k, ids.length - 1) + 1) % ids.length;
      const b = ids[idx] === a ? ids[(idx + 1) % ids.length] : ids[idx];
      const [A,B] = relAB(a,b);
      if ((A.score ?? 50) > 30){
        A.score = 18 + (hashInt(a + "|" + b, 12)); // 18..29
        B.score = 18 + (hashInt(b + "|" + a, 12));
        A.treaties.nap = B.treaties.nap = false;
        A.treaties.alliance = B.treaties.alliance = false;
      }
    }
  }
}

/* ===================== Economy ===================== */
function strengthFromProd(prod){
  const BASE = 50_000;
  return Math.max(0.25, Math.min(4, Math.sqrt(Math.max(prod, 1) / BASE)));
}
function adjustPolicy(e, ctx){
  const P = e.persona || PERSONAS.balanced;
  const K = 0.12, J = P.volatility || 0.02;

  let tTax=P.tax, tCons=P.cons, tInv=P.inv, tDef=P.def, tDraft=P.draft;
  if (ctx.coverage < 0.9) tDef = Math.min(0.20, tDef + 0.04*(0.9-ctx.coverage));
  if (ctx.netDay   < 0)   tDef = Math.max(0.04, tDef + 0.5*(ctx.netDay/(ctx.incomeDay+1e-6)));
  if (ctx.atWarAny){ tDef = Math.min(0.25, Math.max(tDef, P.def+0.04)); tDraft = Math.min(0.30, Math.max(tDraft, P.draft+0.02)); }

  e.taxRate += (tTax  - e.taxRate) * K + (Math.random()-0.5) * J;
  e.cons    += (tCons - e.cons)    * K + (Math.random()-0.5) * J;
  e.inv     += (tInv  - e.inv)     * K + (Math.random()-0.5) * J;

  e.military.budgetPct += (tDef   - e.military.budgetPct) * K;
  e.military.draftPct  += (tDraft - e.military.draftPct)  * K;

  const ci = e.cons + e.inv; if (ci !== 1){ e.cons /= ci; e.inv = 1 - e.cons; }

  e.taxRate = Math.max(0, Math.min(0.60, e.taxRate));
  e.military.budgetPct = Math.max(0, Math.min(0.40, e.military.budgetPct));
  e.military.draftPct  = Math.max(0, Math.min(0.30, e.military.draftPct));
}
function atWarAnyFor(id){
  const row = ai.rels?.[id]; if (!row) return false;
  for (const k in row) if (row[k]?.atWar) return true;
  return false;
}
function advance(e, days){
  const f = days / DAYS_IN_YEAR;
  const def = e.military.budgetPct ?? 0;

  const annualStabRate = (0.22 - e.taxRate) + 0.20*(e.cons - 0.60) + 0.10*(def - 0.08);
  const popRate        = (e.cons * 0.10 - 0.03) + 0.005 * (e.stability - 0.60);

  const invExtra = Math.max(0, e.inv - 0.28);
  let prodRate   = -0.020 + 0.090*Math.sqrt(invExtra) - 0.020*Math.max(0, 0.08 - def) + 0.010*Math.sqrt(Math.max(0, def - 0.08));

  const labourRate = (1 + popRate) * (1 + Math.max(0, annualStabRate)) - 1;

  e.stability     = Math.max(0, Math.min(1, e.stability + annualStabRate * f));
  e.pop          *= 1 + popRate    * f;
  e.labourForce  *= 1 + labourRate * f;
  e.productivity *= 1 + prodRate   * f;
  e.GDP           = e.labourForce * e.productivity;

  const incomeDay = (e.GDP * e.taxRate) / DAYS_IN_YEAR;
  const budgetDay = incomeDay * (e.military.budgetPct ?? 0);
  let budgetPool  = budgetDay * days;

  const troops = e.labourForce * (e.military.draftPct ?? 0);
  const spt    = strengthFromProd(e.productivity);
  const reqUpkeep =
    (e.military.upkeepPerTroopDaily ?? 50) * troops +
    ((e.military.upkeepPerEquipPowerAnnual ?? 100_000) / DAYS_IN_YEAR) * (e.military.equipPower ?? 0);

  const upkeepPaid = Math.min(reqUpkeep, budgetPool, Math.max(0, e.treasury));
  budgetPool -= upkeepPaid; e.treasury -= upkeepPaid;

  const procurementSpend = Math.min(budgetPool, Math.max(0, e.treasury));
  e.treasury -= procurementSpend;

  const baseDecayPerDay = 0.01 / DAYS_IN_YEAR;
  e.military.equipPower = Math.max(0, (e.military.equipPower ?? 0) * (1 - baseDecayPerDay * days));

  const coverage = reqUpkeep > 0 ? upkeepPaid / reqUpkeep : 1;
  if (coverage < 1){
    const shortfall = 1 - coverage;
    const extraDecayPerDay = (0.04 * shortfall) / DAYS_IN_YEAR;
    e.military.equipPower *= (1 - extraDecayPerDay * days);
    e.military.readiness   = Math.max(0, (e.military.readiness ?? 0.7) - 0.003 * shortfall * days);
  } else {
    e.military.readiness   = Math.min(1, (e.military.readiness ?? 0.7) + 0.001 * days);
  }

  e.military.equipPower += procurementSpend * (e.military.procurementEfficiency ?? 1e-7);
  e.military.power = Math.max(0, troops * spt + (e.military.equipPower ?? 0));

  e.treasury += incomeDay * (1 - (e.military.budgetPct ?? 0)) * days;

  return { incomeDay, coverage, atWarAny: false, netDay: incomeDay * (1 - (e.military.budgetPct ?? 0)) - upkeepPaid };
}

/* ===================== O(1) War Counter + toggles ===================== */
function recountWarsOnce(){
  const rel = ai.rels || {};
  let n = 0;
  for (const a in rel) for (const b in rel[a]) if (a < b && rel[a][b]?.atWar) n++;
  ai.GLOBAL_WAR_COUNT = n;
}
function warsAtCap(){ return ai.GLOBAL_WAR_COUNT >= GLOBAL_WAR_CAP; }

function startWar(a, b){
  const [A,B] = relAB(a,b);
  if (A.atWar || warsAtCap()) return false;
  A.atWar = true; B.atWar = true;
  A.treaties.nap = B.treaties.nap = false;
  A.treaties.alliance = B.treaties.alliance = false;
  ai.GLOBAL_WAR_COUNT++;
  if (window.updateWarLines) window.updateWarLines();
  return true;
}
function endWar(a, b){
  const [A,B] = relAB(a,b);
  if (!A.atWar) return false;
  A.atWar = false; B.atWar = false;
  ai.GLOBAL_WAR_COUNT = Math.max(0, ai.GLOBAL_WAR_COUNT - 1);
  if (window.updateWarLines) window.updateWarLines();
  return true;
}

/* ===================== War Planning ===================== */
function countActiveWars(id){
  const row = ai.rels?.[id] ?? {};
  let n = 0; for (const k in row) if (row[k]?.atWar) n++;
  return n;
}
function myPowerSnapshot(id, econ){
  const p = (econ?.military?.power ?? Number(state.countryData[id]?.military_power) ?? 0);
  return Math.max(1, p);
}
function aiDenouncePlan(attackerId, targetId, econ){
  const delay = Math.max(1, Math.round(WAR_DELAY_DAYS * personaDelayMult(econ.persona)));
  const [A,B] = relAB(attackerId, targetId);
  const today = simDay();
  A.denounce = { onDay: today, warEligibleOn: today + delay, reason: "Hostility" };
  A.treaties.nap = B.treaties.nap = false;
  A.treaties.alliance = B.treaties.alliance = false;
  A.score = Math.max(0, (A.score ?? 50) - 15);
  B.score = Math.max(0, (B.score ?? 50) - 8);
  econ.warPlan = { target: targetId, eligible: today + delay };
}
function aiCanDeclareWar(attackerId, targetId){
  const [A] = relAB(attackerId, targetId);
  return !!A.denounce && simDay() >= (A.denounce.warEligibleOn ?? Infinity);
}
function aiTryDeclarePlannedWar(attackerId, econ){
  const plan = econ.warPlan; if (!plan) return false;
  if (warsAtCap()) return false;

  const today = simDay();
  const [A] = relAB(attackerId, plan.target);
  if (A.atWar) { econ.warPlan = null; return false; }
  if (today < (plan.eligible ?? Infinity)) return false;

  const theirP = Number(state.countryData[plan.target]?.military_power) || 0;
  const ratio  = myPowerSnapshot(attackerId, econ) / Math.max(1, theirP);
  if (ratio < 1.02) { econ.warPlan = null; return false; }

  if (startWar(attackerId, plan.target)) { econ.warPlan = null; return true; }
  return false;
}

/* ===================== Diplomacy step (neighbor-biased) ===================== */
function diplomacyStepMyCountry(id, econ){
  const rels = ai.rels?.[id] || {};
  const ids  = Object.keys(rels).filter(x => x !== id);

  if (countActiveWars(id) >= MAX_WARS_PER_AI) return;
  if (aiTryDeclarePlannedWar(id, econ)) return;   // may flip to war if timer elapsed
  if (warsAtCap()) return;

  // Growth retaliation: if denounced & eligible, answer near parity
  if (econ.persona === PERSONAS.growth){
    for (const other of ids){
      const inbound = ai.rels?.[other]?.[id]?.denounce;
      const Rmine   = rels[other];
      if (!inbound || Rmine?.atWar) continue;
      if (simDay() < (inbound.warEligibleOn ?? Infinity)) continue;
      const theirP = Number(state.countryData[other]?.military_power) || 0;
      const ratio  = myPowerSnapshot(id, econ) / Math.max(1, theirP);
      if (ratio >= 0.95){
        if (!Rmine.denounce) aiDenouncePlan(id, other, econ);
        if (aiCanDeclareWar(id, other)) { startWar(id, other); econ.warPlan = null; return; }
      }
    }
  }

  // Pick most hostile, bias to neighbors
  const neigh = new Set(neighborsOf(id));
  let best = null, bestScore = 1e9;

  for (let i = 0; i < ids.length; i++){
    const other = ids[i];
    const R = rels[other];
    if (!R || R.atWar) continue;
    if (R.treaties?.alliance || R.treaties?.nap) continue;

    let s = (R.score ?? 50);
    if (neigh.has(other)) s -= 10; else s -= 2;

    if (s < bestScore){ best = other; bestScore = s; }
  }
  if (!best || (rels[best]?.score ?? 50) > HOSTILITY_CUTOFF) return;

  const theirP = Number(state.countryData[best]?.military_power) || 0;
  const ratio  = myPowerSnapshot(id, econ) / Math.max(1, theirP);
  const need   = Math.max(1.0 + personaRatioSlack(econ.persona), RATIO_TO_BULLY);
  const roll   = Math.random() < (0.25 + 0.25 * personaAggroMult(econ.persona)); // ~25–75%

  if (ratio >= need && roll){
    if (!rels[best].denounce) {
      aiDenouncePlan(id, best, econ);
    } else if (aiCanDeclareWar(id, best) && !warsAtCap()) {
      startWar(id, best);
      econ.warPlan = null;
    }
  }
}

/* ===================== Init ===================== */
export function initAI(){
  ai.econById = Object.create(null);
  ai.ids = Object.keys(state.countryData || {});
  initDiplomacyMatrixOnce();
  seedRivalries(ai.ids);

  for (let i = 0; i < ai.ids.length; i++){
    const id = ai.ids[i];
    const d  = state.countryData[id] || {};
    const pop  = Number(d.population) || 1_000_000;
    const gdpM = Number(d.GDP) || 100;     // millions
    const GDP  = gdpM * 1e6;

    const labourForce  = pop * 0.60;
    const productivity = Math.max(1, GDP / Math.max(1, labourForce));

    const pKey = personaKeyFor(id);
    ai.econById[id] = {
      pop, labourForce, productivity,
      GDP: labourForce * productivity,
      stability: 0.85,
      personaKey: pKey,
      persona: PERSONAS[pKey],
      taxRate: PERSONAS[pKey].tax,
      cons:    PERSONAS[pKey].cons,
      inv:     PERSONAS[pKey].inv,
      treasury: GDP * 0.05,
      military: {
        draftPct: PERSONAS[pKey].draft,
        equipPower: Math.max(50, Math.sqrt(GDP) / 1e3),
        readiness: 0.70,
        budgetPct: PERSONAS[pKey].def,
        upkeepPerTroopDaily: 50,
        upkeepPerEquipPowerAnnual: 100_000,
        procurementEfficiency: 1e-7,
      },
      _econAcc: 0,
      warPlan: null,
    };

    (state.countryData[id] ||= {}).persona = pKey; // expose to UI
  }

  recountWarsOnce(); // initialize O(1) global counter
  ai.diploCursor = 0;
}

/* ===================== Daily step ===================== */
export function stepAI(days = 1){
  const pid = String(state?.gameState?.playerCountryId ?? "");

  // 1) Economics for everyone (batched by AI_ECON_STEP_DAYS)
  for (let i = 0; i < ai.ids.length; i++){
    const id = ai.ids[i];
    if (id === pid) continue;
    const e = ai.econById[id]; if (!e) continue;

    e._econAcc = (e._econAcc || 0) + days;
    if (e._econAcc >= AI_ECON_STEP_DAYS){
      const step = e._econAcc; e._econAcc = 0;

      const ctx0 = {
        incomeDay: (e.GDP * (e.taxRate ?? 0)) / DAYS_IN_YEAR,
        coverage: 1,
        atWarAny: atWarAnyFor(id),
        netDay: 0,
      };
      adjustPolicy(e, ctx0);
      advance(e, step);

      // write back for UI/leaderboard (GDP in millions)
      const d = state.countryData[id] || (state.countryData[id] = { name: id });
      d.population     = Math.round(e.pop);
      d.GDP            = e.GDP / 1e6;
      d.military_power = Math.round(e.military.power);
      d.readiness      = Math.round((e.military.readiness ?? 0.7) * 100) / 100;
    }
  }

  // 2) Diplomacy slice (spread work over days)
  const N = ai.ids.length;
  const slice = Math.min(DIPLO_SLICE_PER_DAY, N);
  let progressed = 0;

  for (let s = 0; s < slice; s++){
    const idx = (ai.diploCursor + s) % N;
    const id  = ai.ids[idx];
    if (id === pid) continue;
    const e = ai.econById[id];
    if (!e) continue;
    diplomacyStepMyCountry(id, e);
    progressed++;
  }
  ai.diploCursor = (ai.diploCursor + progressed) % N;

  // Coalesced UI refresh
  if (window.scheduleLeaderboardUpdate) window.scheduleLeaderboardUpdate();
  if (window.scheduleWarLinesUpdate)    window.scheduleWarLinesUpdate();
}

// Expose for other modules (optional)
window.initAI = initAI;
window.stepAI = stepAI;

window.endWarBetween = endWar;
