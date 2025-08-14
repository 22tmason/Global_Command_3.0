// sidebar.js
import { state } from "./state.js";
import {
  pauseTimer,
  startTimer,
  setTimeScale,
  resetSimulationDate,
  simulationDate
} from "./timer.js";
import { formatCompactNumber } from "./utilities.js";

let econ = null;

export function updateClockDisplay() {
  const el = document.getElementById("sim-clock");
  if (!el || !simulationDate) return;
  el.textContent = simulationDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function buildGameSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = `
    <div id="drag-handle"></div>
    <!-- Box: Settings & Time -->
    <div class="box" id="box-settings">
      <button id="settings-btn-sidebar" class="time-btn">Settings</button>
      <div id="time-box">
        <!-- Date Display -->
        <div id="time-date">Date: <span id="sim-clock" class="toolbar-date">—</span></div>
        <!-- Speed buttons -->
        <div id="time-controls">
          <button data-speed="0" class="time-btn">❚❚</button>
          <button data-speed="1" class="time-btn">1×</button>
          <button data-speed="3" class="time-btn">3×</button>
          <button data-speed="10" class="time-btn">10×</button>
        </div>
      </div>
    </div>

    <!-- Box: Country Name-->
    <div class="box" id="box-header">
      <h2 id="in-game-header"></h2>
    </div>

    <!-- Box: Management Modes -->
    <div class="box" id="box-modes">
      <button id="mode-diplomacy" class="mode-btn active">Diplomacy</button>
      <button id="mode-economy"   class="mode-btn">Economy</button>
      <button id="mode-military"  class="mode-btn">Military</button>
    </div>

    <!-- Box: Content Area -->
    <div class="box" id="box-content">
      <div id="content-diplomacy" class="content-page"></div>
      <div id="content-economy"   class="content-page" style="display:none"></div>
      <div id="content-military"  class="content-page" style="display:none"></div>
    </div>
  `;

  document.getElementById("in-game-header").textContent =
    state.countryData[state.gameState.playerCountryId].name;

  document.getElementById("settings-btn-sidebar").addEventListener("click", () =>
    document.getElementById("settings-modal")?.classList.remove("hidden")
  );

  const tc = sidebar.querySelectorAll("#time-controls button");
  tc.forEach(btn => btn.addEventListener("click", () => {
    const speed = Number(btn.dataset.speed);
    if (speed === 0) pauseTimer();
    else { setTimeScale(speed); startTimer(); }
    tc.forEach(b => b.classList.toggle("active", b === btn));
  }));

  const modes = ["diplomacy","economy","military"];
  modes.forEach(mode => {
    document.getElementById(`mode-${mode}`).addEventListener("click", () => {
      modes.forEach(m => {
        document.getElementById(`mode-${m}`).classList.toggle("active", m === mode);
        document.getElementById(`content-${m}`).style.display = m === mode ? "block" : "none";
      });
    });
  });

  buildDiplomacy();
  buildEconomy();
  buildMilitary();
  updateClockDisplay();
}

function buildDiplomacy() {
  const el = document.getElementById("content-diplomacy");
  el.innerHTML = `<p>Select a country to view diplomacy information.</p>`;
}

function buildEconomy() {
  document.getElementById("content-economy").innerHTML = `
    <div class="econ-grid">
      <!-- Stability card -->
      <div class="econ-card">
        <div class="card-header">Stability</div>
        <div class="card-value">
          <span id="stab-value">—%</span>
        </div>
        <div class="card-growth" title="Annual change">
          <span id="stab-growth">—%</span>
        </div>
      </div>

      <!-- GDP card -->
      <div class="econ-card">
        <div class="card-header">GDP</div>
        <div class="card-value">
          $<span id="econ-gdp-total">—</span>
        </div>
        <div class="card-growth" title="Annual change">
          <span id="econ-gdp-growth">—%</span>
        </div>
      </div>

      <!-- Population card -->
      <div class="econ-card">
        <div class="card-header">Population</div>
        <div class="card-value">
          <span id="econ-population">—</span>
        </div>
        <div class="card-growth" title="Annual change">
          <span id="econ-pop-growth">—%</span>
        </div>
      </div>

      <!-- Labour Force card -->
      <div class="econ-card">
        <div class="card-header">Labour Force</div>
        <div class="card-value">
          <span id="econ-labour-force">—</span>
        </div>
        <div class="card-growth" title="Annual change">
          <span id="econ-labour-growth">—%</span>
        </div>
      </div>

      <!-- Productivity card -->
      <div class="econ-card">
        <div class="card-header">Productivity</div>
        <div class="card-value">
          <span id="econ-labour-productivity">—</span>
        </div>
        <div class="card-growth" title="Annual change">
          <span id="econ-prod-growth">—%</span>
        </div>
      </div>

      <!-- Treasury card (Gov revenue shown below) -->
      <div class="econ-card">
        <div class="card-header">Treasury</div>
        <div class="card-value">
          $<span id="econ-treasury-total">—</span>
        </div>
        <div class="card-growth" title="Gov revenue per day">
          +$<span id="econ-gov-revenue">—</span>/day
        </div>
      </div>
    </div>

    <div class="econ-sliders">
      <div class="econ-card slider-card">
        <div class="card-header"><span>Tax &amp; C/I</span></div>
        
        <!-- Tax row -->
        <div class="slider-group">
          <label>Tax Rate: <span id="tax-rate-display">—%</span></label>
          <input type="range" id="tax-slider" min="0" max="100" step="1" value="30" />
          <div class="slider-info">
            <small>Stab: <span id="tax-stability-effect">—%</span></small>
            <small>Rev: <span id="tax-revenue-effect">—</span></small>
          </div>
        </div>

        <!-- Consumption row -->
        <div class="slider-group">
          <label>Consumption: <span id="consumption-display">—%</span></label>
          <input id="consumption-slider" type="range" min="0" max="100" step="1" value="35" />
          <div class="slider-info">
            <small>Pop Δ: <span id="ci-pop-effect">—%</span></small>
          </div>
        </div>

        <!-- Investment row -->
        <div class="slider-group">
          <label>Investment: <span id="investment-display">—%</span></label>
          <input id="investment-slider" type="range" min="0" max="100" step="1" value="35" />
          <div class="slider-info">
            <small>Prod Δ: <span id="ci-prod-effect">—%</span></small>
          </div>
        </div>
      </div>
    </div>
  `;
  initEconomyLogic();
}

function buildMilitary() {
  const el = document.getElementById("content-military");
  el.innerHTML = `
    <div class="econ-grid">
      <div class="econ-card">
        <div class="card-header">Treasury</div>
        <div class="card-value">
          $<span id="mil-treasury">—</span>
        </div>
      </div>

      <div class="econ-card">
        <div class="card-header">Daily Income</div>
        <div class="card-value">
          $<span id="mil-daily-income">—</span>/day
        </div>
      </div>

      <div class="econ-card">
        <div class="card-header">Military Power</div>
        <div class="card-value">
          <span id="mil-power">—</span>
        </div>
        <div class="card-growth" title="Net daily change">
          <span id="mil-power-delta">—/day</span>
        </div>
      </div>

      <div class="econ-card">
        <div class="card-header">Readiness</div>
        <div class="card-value">
          <span id="mil-readiness">—%</span>
        </div>
      </div>

      <div class="econ-card">
        <div class="card-header">Upkeep</div>
        <div class="card-value">
          $<span id="mil-upkeep">—</span>/day
        </div>
        <div class="card-growth" title="Upkeep coverage">
          Paid: $<span id="mil-upkeep-paid">—</span> / Req: $<span id="mil-upkeep-req">—</span>
        </div>
      </div>

      <div class="econ-card">
        <div class="card-header">Net Change</div>
        <div class="card-value">
          $<span id="mil-net">—</span>/day
        </div>
      </div>
    </div>

    <div class="econ-card slider-card">
      <div class="card-header"><span>Defense Budget</span></div>
      <div class="slider-group">
        <label>Defense Budget: <span id="defense-budget-display">—%</span> of revenue</label>
        <input id="defense-budget-slider" type="range" min="0" max="100" step="1" value="10" />
        <div class="slider-info">
          <small>Planned Spend/day: $<span id="defense-planned-spend">—</span></small>
        </div>
      </div>

      <!-- Military Service slider -->
      <div class="slider-group">
        <label>Military Service: <span id="draft-display">—%</span> of labour force</label>
        <input id="draft-slider" type="range" min="0" max="30" step="1" value="5" />
        <div class="slider-info">
          <small>Troops: <span id="draft-troops">—</span></small>
        </div>
      </div>
    </div>
  `;

  // hook up budget slider
  const s = document.getElementById("defense-budget-slider");
  if (s) {
    const pct0 = (econ?.military?.budgetPct ?? 0.10);
    s.value = Math.round(pct0 * 100);
    const update = () => {
      const pct = Number(s.value) / 100;
      if (!econ.military) econ.military = {};
      econ.military.budgetPct = pct;
      const dd = document.getElementById("defense-budget-display");
      if (dd) dd.textContent = Math.round(pct * 100) + "%";
      if (window.updateEconomy) window.updateEconomy();
    };
    s.addEventListener("input", update);
    update();
  }

  // hook up draft slider
  const d = document.getElementById("draft-slider");
  if (d) {
    const updateDraft = () => {
      if (!econ.military) econ.military = {};
      econ.military.draftPct = Number(d.value) / 100; // 0..0.30
      if (window.updateEconomy) window.updateEconomy();
    };
    // initialize from existing
    d.value = Math.round(((econ?.military?.draftPct ?? 0.05) * 100));
    d.addEventListener("input", updateDraft);
    updateDraft();
  }
}

function initEconomyLogic() {
  const elems = {
    stabValue:       document.getElementById("stab-value"),
    stabGrowth:      document.getElementById("stab-growth"),
    gdpTotal:        document.getElementById("econ-gdp-total"),
    gdpGrowth:       document.getElementById("econ-gdp-growth"),
    pop:             document.getElementById("econ-population"),
    popGrowth:       document.getElementById("econ-pop-growth"),
    lf:              document.getElementById("econ-labour-force"),
    lfGrowth:        document.getElementById("econ-labour-growth"),
    prod:            document.getElementById("econ-labour-productivity"),
    prodGrowth:      document.getElementById("econ-prod-growth"),

    // Treasury card elements
    treasury:        document.getElementById("econ-treasury-total"),
    govRev:          document.getElementById("econ-gov-revenue"),

    // Sliders
    taxSlider:       document.getElementById("tax-slider"),
    taxRateDisplay:  document.getElementById("tax-rate-display"),
    taxStabEffect:   document.getElementById("tax-stability-effect"),
    taxRevEffect:    document.getElementById("tax-revenue-effect"),

    consSlider:      document.getElementById("consumption-slider"),
    consDisplay:     document.getElementById("consumption-display"),
    ciPopEffect:     document.getElementById("ci-pop-effect"),

    invSlider:       document.getElementById("investment-slider"),
    invDisplay:      document.getElementById("investment-display"),
    ciProdEffect:    document.getElementById("ci-prod-effect")
  };

  function normalizeSliders(changed) {
    const tax  = +elems.taxSlider.value;
    const cons = +elems.consSlider.value;
    const inv  = +elems.invSlider.value;
    const total = tax + cons + inv;
    if (total === 100) return;

    const others = [elems.taxSlider, elems.consSlider, elems.invSlider]
      .filter(s => s !== changed);
    const sumOthers = others.reduce((sum,s) => sum + (+s.value), 0);
    const remainder = 100 - +changed.value;

    if (sumOthers <= 0) {
      others.forEach(s => s.value = (remainder / others.length).toFixed(0));
    } else {
      others.forEach(s => {
        s.value = Math.round((+s.value) * remainder / sumOthers);
      });
    }
  }

  const cd = state.countryData[state.gameState.playerCountryId];
  econ = {
    pop:           cd.population,
    stability:     0.60,
    labourForce:   cd.population * 0.60,
    taxRate:       elems.taxSlider.value  / 100,
    cons:          elems.consSlider.value / 100,
    inv:           elems.invSlider.value  / 100
  };
  econ.productivity  = (cd.GDP * 1e6) / econ.labourForce;
  econ.GDP           = econ.labourForce * econ.productivity;
  econ.labourCapita  = econ.productivity;

  // --- Military baseline (population + productivity + equipment) ---
  econ.military = econ.military || {};
  // Draft % default 5% of labour force
  if (typeof econ.military.draftPct !== "number") {
    econ.military.draftPct = 0.05;
  }
  // Equipment stock that procurement increases over time
  if (typeof econ.military.equipPower !== "number") {
    econ.military.equipPower = 100; // small seed so changes are visible
  }
  econ.military.readiness = (typeof econ.military.readiness === "number") ? econ.military.readiness : 0.70;
  econ.military.budgetPct = (typeof econ.military.budgetPct === "number") ? econ.military.budgetPct : 0.10;

  // Costs & efficiency
  econ.military.upkeepPerTroopDaily          = econ.military.upkeepPerTroopDaily ?? 50;           // $ / troop / day
  econ.military.upkeepPerEquipPowerAnnual    = econ.military.upkeepPerEquipPowerAnnual ?? 100_000; // $ / equip-power / yr
  econ.military.procurementEfficiency        = econ.military.procurementEfficiency ?? 1e-7;       // equip-power per $

  // Treasury (start with ~30 days of revenue)
  if (typeof econ.treasury !== "number") {
    const dailyInc0 = (econ.GDP * econ.taxRate) / 365;
    econ.treasury = dailyInc0 * 30;
  }
  // Ensure a draft percentage exists (0–30%) even if Military UI hasn't run yet
  if (!econ.military) econ.military = {};
  if (typeof econ.military.draftPct !== "number") {
    econ.military.draftPct = 0.05;  // 5% default; tweak as you like
  }


  // Helper: strength per troop rises with productivity (diminishing returns)
  function strengthFromProd(prod) {
    const BASE_PROD = 100_000; // $ per worker baseline
    const ratio = Math.sqrt(Math.max(prod, 1) / BASE_PROD);
    return Math.max(0.25, Math.min(4, ratio)); // clamp
  }

  function advanceEconomy(days = 1) {
    // === Original economy (kept intact) ===
    const annualStabRate = 0.3 - econ.taxRate;
    econ.stability = Math.min(
      1, Math.max(0,
        econ.stability + (annualStabRate/365)*days
      )
    );

    // Population growth
    const annualPopRate = econ.cons * 0.10 - 0.03;
    econ.pop *= Math.pow(1 + annualPopRate/365, days);

    // Labour Force (draft-aware)
    // Clamp stability between 0–1 for safety
    const clampedStability = Math.max(0, Math.min(1, econ.stability));

    // Base labour force share from stability
    const labourForceShare = 0.2 + clampedStability * (0.8 - 0.2);
    const baseLF = econ.pop * labourForceShare;                // before draft

    // Draft percentage (cap 0–30%)
    const draftPct = Math.max(0, Math.min(0.30, econ.military?.draftPct ?? 0));

    // Split into troops vs economic workers
    const draftedLF = baseLF * draftPct;                       // people in uniform
    const econLF    = baseLF * (1 - draftPct);                 // workers in the economy

    // Store both for UI/debugging if you want
    econ.labourForceBase = baseLF;                              // optional
    econ.troops          = draftedLF;                           // optional

    // Use economic labour force for GDP & displays
    econ.labourForce = econLF;

    // Recompute GDP from new productivity & *economic* labour
    econ.GDP = econ.labourForce * econ.productivity;


    // === Treasury & Military update (population + productivity + equipment) ===
    const dailyIncome = (econ.GDP * econ.taxRate) / 365;
    econ.treasury += dailyIncome * days;

    // Troops/power components
    const troops    = econ.labourForce * (econ.military?.draftPct ?? 0);
    const spt       = strengthFromProd(econ.productivity);
    const basePower = troops * spt;
    let   equipPower= econ.military.equipPower ?? 0;

    // REQUIRED upkeep first (troops + equipment)
    const troopUpkPerDay = (econ.military.upkeepPerTroopDaily ?? 0) * troops;
    const equipUpkPerDay = ((econ.military.upkeepPerEquipPowerAnnual ?? 0)/365) * equipPower;
    const requiredUpkeep = (troopUpkPerDay + equipUpkPerDay) * days;

    const upkeepPaid = Math.min(requiredUpkeep, econ.treasury);
    econ.treasury   -= upkeepPaid;

    // Procurement budget (after upkeep)
    const budgetPerDay       = dailyIncome * (econ.military?.budgetPct ?? 0);
    const procurementPlanned = budgetPerDay * days;
    const procurementSpend   = Math.min(procurementPlanned, econ.treasury);
    econ.treasury           -= procurementSpend;

    // Equipment decay & readiness effects
    const baseDecayPerDay = 0.01 / 365;
    equipPower *= Math.pow(1 - baseDecayPerDay, days);

    const coverage = requiredUpkeep > 0 ? (upkeepPaid / requiredUpkeep) : 1;
    if (coverage < 1) {
      const shortfall = 1 - coverage;
      const extraDecayPerDay = (0.04 * shortfall) / 365;
      equipPower *= Math.pow(1 - extraDecayPerDay, days);
      econ.military.readiness = Math.max(0, (econ.military.readiness ?? 0.7) - 0.003 * shortfall * days);
    } else {
      econ.military.readiness = Math.min(1, (econ.military.readiness ?? 0.7) + 0.001 * days);
    }

    // Procurement adds equipment power
    const equipGain = procurementSpend * (econ.military.procurementEfficiency ?? 1e-7);
    equipPower += equipGain;

    // Total power (population+prod base + equipment stock)
    econ.military.equipPower = equipPower;
    econ.military.power = Math.max(0, basePower + equipPower);

    // Metrics for UI (per-day)
    econ.last = econ.last || {};
    econ.last.dailyIncome      = dailyIncome;
    econ.last.upkeep           = (troopUpkPerDay + equipUpkPerDay);
    econ.last.upkeepPaid       = upkeepPaid / days;
    econ.last.plannedDefense   = budgetPerDay;
    econ.last.procurementSpend = procurementSpend / days;
    econ.last.actualDefense    = econ.last.upkeepPaid + econ.last.procurementSpend;
    econ.last.net              = dailyIncome - econ.last.actualDefense;
    // Approx equipment-only delta
    econ.last.powerDelta       = (equipGain / days) - (0.01/365)*equipPower;
  }
  window.advanceEconomy = advanceEconomy;

  function recalc() {
    const elLFDrafted = document.getElementById("lf-drafted");
    if (elLFDrafted && typeof econ.labourForceBase === "number") {
      elLFDrafted.textContent = formatCompactNumber(econ.labourForceBase - econ.labourForce);
    }
    // === Original economy display (kept intact) ===
    // Compute annual rates as decimals
    const rawStabRate = 0.3 - econ.taxRate;
    const popRate     = econ.cons * 0.10 - 0.03;
    const prodRate    = econ.inv  * 0.10 - 0.03;

    // Once stability is maxed (1.0), it no longer grows
    const stabRate = econ.stability < 1 ? rawStabRate : 0;

    // Labour‐force growth = (1+popRate)*(1+stabilityRate) - 1
    const labourRate    = (1 + popRate) * (1 + stabRate) - 1;

    // GDP growth    = (1+labourRate)*(1+prodRate) - 1
    const annualGdpRate = (1 + labourRate) * (1 + prodRate) - 1;

    // Build the display strings
    const stabGr = (stabRate    * 100).toFixed(2) + "%";
    const popGr  = (popRate     * 100).toFixed(2) + "%";
    const lfGr   = (labourRate  * 100).toFixed(2) + "%";
    const prodGr = (prodRate    * 100).toFixed(2) + "%";
    const gdpGr  = (annualGdpRate * 100).toFixed(2) + "%";

    elems.stabValue.textContent  = (econ.stability * 100).toFixed(2) + "%";
    elems.stabGrowth.textContent = stabGr;

    elems.gdpTotal.textContent   = formatCompactNumber(econ.GDP);
    elems.gdpGrowth.textContent  = gdpGr;

    elems.pop.textContent        = formatCompactNumber(econ.pop);
    elems.popGrowth.textContent  = popGr;

    elems.lf.textContent         = formatCompactNumber(econ.labourForce);
    elems.lfGrowth.textContent   = lfGr;

    elems.prod.textContent       = formatCompactNumber(econ.productivity);
    elems.prodGrowth.textContent = prodGr;

    // Treasury + Gov revenue/day on Economy tab
    const dailyIncome = (econ.GDP * econ.taxRate) / 365;
    if (elems.treasury) elems.treasury.textContent = formatCompactNumber(econ.treasury);
    elems.govRev.textContent     = formatCompactNumber(dailyIncome);

    // Slider readouts
    elems.taxRateDisplay.textContent = (econ.taxRate * 100).toFixed(0) + "%";
    elems.taxStabEffect.textContent  = stabGr;
    elems.taxRevEffect.textContent   = formatCompactNumber(dailyIncome);

    elems.consDisplay.textContent    = (econ.cons * 100).toFixed(0) + "%";
    elems.ciPopEffect.textContent    = popGr;

    elems.invDisplay.textContent     = (econ.inv * 100).toFixed(0) + "%";
    elems.ciProdEffect.textContent   = prodGr;

    // === Military UI (population + productivity + equipment) ===
    const troops = econ.labourForce * (econ.military?.draftPct ?? 0);
    const spt    = strengthFromProd(econ.productivity);
    const basePower = troops * spt;
    const totalPower = basePower + (econ.military?.equipPower ?? 0);

    // Update draft UI (if present)
    const draftDisplay = document.getElementById("draft-display");
    const draftTroops  = document.getElementById("draft-troops");
    if (draftDisplay) draftDisplay.textContent = Math.round((econ.military?.draftPct ?? 0) * 100) + "%";
    if (draftTroops)  draftTroops.textContent  = formatCompactNumber(troops);

    // Military Power card
    const elPow = document.getElementById("mil-power");
    if (elPow) elPow.textContent = formatCompactNumber(Math.round(totalPower));

    // Upkeep/day (required) + coverage
    const perTroopUpk = (econ.military?.upkeepPerTroopDaily ?? 0) * troops;
    const perEquipUpk = ((econ.military?.upkeepPerEquipPowerAnnual ?? 0)/365) * (econ.military?.equipPower ?? 0);
    const upkeepDay   = perTroopUpk + perEquipUpk;

    const elUpk = document.getElementById("mil-upkeep");
    if (elUpk) elUpk.textContent = formatCompactNumber(upkeepDay);

    const elUpkPaid = document.getElementById("mil-upkeep-paid");
    if (elUpkPaid) elUpkPaid.textContent = formatCompactNumber(econ.last?.upkeepPaid ?? 0);

    const elUpkReq = document.getElementById("mil-upkeep-req");
    if (elUpkReq) elUpkReq.textContent = formatCompactNumber(econ.last?.upkeep ?? upkeepDay);

    // Treasury & Income on Military tab
    const elTreas = document.getElementById("mil-treasury");
    if (elTreas) elTreas.textContent = formatCompactNumber(econ.treasury);

    const elDI = document.getElementById("mil-daily-income");
    if (elDI) elDI.textContent = formatCompactNumber(econ.last?.dailyIncome || dailyIncome);

    const elPowDelta = document.getElementById("mil-power-delta");
    if (elPowDelta) elPowDelta.textContent = formatCompactNumber(econ.last?.powerDelta ?? 0) + " /day";

    const elRead = document.getElementById("mil-readiness");
    if (elRead) elRead.textContent = (econ.military.readiness * 100).toFixed(0) + "%";

    const elNet = document.getElementById("mil-net");
    if (elNet) elNet.textContent = formatCompactNumber(econ.last?.net ?? (dailyIncome - upkeepDay));

    const elDefPct = document.getElementById("defense-budget-display");
    if (elDefPct) elDefPct.textContent = Math.round((econ.military?.budgetPct ?? 0)*100) + "%";

    const elPlan = document.getElementById("defense-planned-spend");
    if (elPlan) elPlan.textContent = formatCompactNumber(dailyIncome * (econ.military?.budgetPct ?? 0));
  }

  [elems.taxSlider, elems.consSlider, elems.invSlider]
    .forEach(slider => slider.addEventListener("input", () => {
      normalizeSliders(slider);
      econ.taxRate = elems.taxSlider.value / 100;
      econ.cons    = elems.consSlider.value  / 100;
      econ.inv     = elems.invSlider.value   / 100;
      recalc();
    }));

  window.updateEconomy = recalc;
  recalc();
  updateClockDisplay();
}

export function startGame() {
  resetSimulationDate();
  state.gameState.playerCountryId = state.confirmedCountryId;
  state.gameState.control[state.confirmedCountryId] = 100;
  buildGameSidebar();
  updateClockDisplay();
}
