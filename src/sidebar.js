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

// Module‐scope econ state
let econ = null;

// Update clock
export function updateClockDisplay() {
  const el = document.getElementById("sim-clock");
  if (!el || !simulationDate) return;
  el.textContent = simulationDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Build sidebar with management tabs
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

  // Populate header name
  document.getElementById("in-game-header").textContent =
    state.countryData[state.gameState.playerCountryId].name;

  // Settings click
  document.getElementById("settings-btn-sidebar").addEventListener("click", () =>
    document.getElementById("settings-modal").classList.remove("hidden")
  );

  // Time controls
  const tc = sidebar.querySelectorAll("#time-controls button");
  tc.forEach(btn => btn.addEventListener("click", () => {
    const speed = Number(btn.dataset.speed);
    if (speed === 0) pauseTimer();
    else { setTimeScale(speed); startTimer(); }
    tc.forEach(b => b.classList.toggle("active", b === btn));
  }));

  // Mode buttons
  const modes = ["diplomacy","economy","military"];
  modes.forEach(mode => {
    document.getElementById(`mode-${mode}`).addEventListener("click", () => {
      modes.forEach(m => {
        document.getElementById(`mode-${m}`).classList.toggle("active", m === mode);
        document.getElementById(`content-${m}`).style.display = m === mode ? "block" : "none";
      });
    });
  });

  // Build pages
  buildDiplomacy();
  buildEconomy();
  buildMilitary();
  updateClockDisplay();

  // Sidebar resize handle (unchanged)…
  // … your existing drag‐handle code here …
}

// Diplomacy page
function buildDiplomacy() {
  const el = document.getElementById("content-diplomacy");
  el.innerHTML = `<p>Select a country to view diplomacy information.</p>`;
}

// Economy page
// sidebar.js (snippet)
function buildEconomy() {
  document.getElementById("content-economy").innerHTML = `
    <!-- ——— 1) Six metric cards ——— -->
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

      <!-- Government Revenue card -->
      <div class="econ-card">
        <div class="card-header">Gov Revenue</div>
        <div class="card-value">
          <span id="econ-gov-revenue">—</span>
        </div>
        <!-- no growth for revenue -->
      </div>
    </div>
    <!-- ——— 2) Unified slider card below ——— -->
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
          <input id="consumption-slider" type="range" min="0" max="100" step="1" value="6" />
          <div class="slider-info">
            <small>Pop Δ: <span id="ci-pop-effect">—%</span></small>
          </div>
        </div>

        <!-- Investment row -->
        <div class="slider-group">
          <label>Investment: <span id="investment-display">—%</span></label>
          <input id="investment-slider" type="range" min="0" max="100" step="1" value="4" />
          <div class="slider-info">
            <small>Prod Δ: <span id="ci-prod-effect">—%</span></small>
          </div>
        </div>
      </div>
    </div>
  `;
  initEconomyLogic();
}

// Military page stub
function buildMilitary() {
  const el = document.getElementById("content-military");
  el.innerHTML = `<p>Military management coming soon.</p>`;
}

// Central economy logic function
function initEconomyLogic() {
  const elems = {
    // the six metric cards
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
    govRev:          document.getElementById("econ-gov-revenue"),

    // the three sliders and their info displays
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

  // Keep tax + cons + inv = 100%
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

  // Initialize econ once
  const cd = state.countryData[state.gameState.playerCountryId];
  econ = {
    pop:           cd.population,
    stability:     0.60,
    labourForce:   cd.population * 0.60,
    taxRate:       elems.taxSlider.value  / 100,
    cons:          elems.consSlider.value / 100,
    inv:           elems.invSlider.value  / 100
  };
  // initial productivity = GDP per worker
  econ.productivity  = (cd.GDP * 1e6) / econ.labourForce;
  // initial GDP
  econ.GDP           = econ.labourForce * econ.productivity;
  // sync labourCapita alias if you still use it downstream
  econ.labourCapita  = econ.productivity;

  // Advance one day's worth of growth
  function advanceEconomy(days = 1) {
    // 1) Stability drift
    const annualStabRate = 0.3 - econ.taxRate;
    econ.stability = Math.min(
      1, Math.max(0,
        econ.stability + (annualStabRate/365)*days
      )
    );

    // 2) Population growth
    const annualPopRate = econ.cons * 0.10 - 0.03;
    econ.pop *= Math.pow(1 + annualPopRate/365, days);

    // 3) Labour Force
    econ.labourForce = econ.pop * econ.stability;

    // 4) Productivity growth (investment-driven)
    const annualProdRate = econ.inv * 0.10 - 0.03;
    const dailyProdFactor= 1 + annualProdRate/365;
    econ.productivity  *= Math.pow(dailyProdFactor, days);

    // 5) Recompute GDP from new productivity & labour
    econ.GDP = econ.labourForce * econ.productivity;
  }
  window.advanceEconomy = advanceEconomy;

  // Recalc & redraw all UI
function recalc() {
  // 1) Compute raw annual rates as decimals
  const rawStabRate = 0.3 - econ.taxRate;            // what stability WOULD change by
  const popRate     = econ.cons * 0.10 - 0.03;       // consumption-driven p.a.
  const prodRate    = econ.inv  * 0.10 - 0.03;       // investment-driven p.a.

  // 2) Once stability is maxed (1.0), it no longer drifts
  const stabRate = econ.stability < 1
    ? rawStabRate
    : 0;

  // 3) Labour‐force growth = (1+popRate)*(1+stabRate) - 1
  const labourRate    = (1 + popRate) * (1 + stabRate) - 1;

  // 4) GDP growth    = (1+labourRate)*(1+prodRate) - 1
  const annualGdpRate = (1 + labourRate) * (1 + prodRate) - 1;

  // 5) Build the display strings
  const stabGr = (stabRate    * 100).toFixed(2) + "%";
  const popGr  = (popRate     * 100).toFixed(2) + "%";
  const lfGr   = (labourRate  * 100).toFixed(2) + "%";
  const prodGr = (prodRate    * 100).toFixed(2) + "%";
  const gdpGr  = (annualGdpRate * 100).toFixed(2) + "%";

  // 6) Update the six metric cards
  elems.stabValue.textContent  = (econ.stability * 100).toFixed(2) + "%";
  elems.stabGrowth.textContent = stabGr;

  elems.gdpTotal.textContent   = "$" + formatCompactNumber(econ.GDP);
  elems.gdpGrowth.textContent  = gdpGr;

  elems.pop.textContent        = formatCompactNumber(econ.pop);
  elems.popGrowth.textContent  = popGr;

  elems.lf.textContent         = formatCompactNumber(econ.labourForce);
  elems.lfGrowth.textContent   = lfGr;

  elems.prod.textContent       = formatCompactNumber(econ.productivity);
  elems.prodGrowth.textContent = prodGr;

  const govRevenue = econ.labourForce * econ.productivity * econ.taxRate;
  elems.govRev.textContent     = formatCompactNumber(govRevenue);

  // 7) Update sliders & their effects
  elems.taxRateDisplay.textContent = (econ.taxRate * 100).toFixed(0) + "%";
  elems.taxStabEffect.textContent  = stabGr;
  elems.taxRevEffect.textContent   = formatCompactNumber(govRevenue);

  elems.consDisplay.textContent    = (econ.cons * 100).toFixed(0) + "%";
  elems.ciPopEffect.textContent    = popGr;

  elems.invDisplay.textContent     = (econ.inv * 100).toFixed(0) + "%";
  elems.ciProdEffect.textContent   = prodGr;
}



  // Wire up normalization + state sync + redraw on slider input
  [elems.taxSlider, elems.consSlider, elems.invSlider]
    .forEach(slider => slider.addEventListener("input", () => {
      normalizeSliders(slider);
      econ.taxRate = elems.taxSlider.value / 100;
      econ.cons    = elems.consSlider.value  / 100;
      econ.inv     = elems.invSlider.value   / 100;
      recalc();
    }));

  // Expose recalc to the timer loop, draw initial state
  window.updateEconomy = recalc;
  recalc();
  updateClockDisplay();
}

// Start game entry
export function startGame() {
  resetSimulationDate();
  state.gameState.playerCountryId = state.confirmedCountryId;
  state.gameState.control[state.confirmedCountryId] = 100;
  buildGameSidebar();
  updateClockDisplay();
}
