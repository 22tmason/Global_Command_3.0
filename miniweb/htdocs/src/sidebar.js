// sidebar.js
import { state }                from "./state.js";
import { pauseTimer,
         startTimer,
         setTimeScale,
         resetSimulationDate,
         simulationDate }      from "./timer.js";
import { formatCompactNumber }   from "./utilities.js";

// Update the <span id="sim-clock">
export function updateClockDisplay() {
  const el = document.getElementById("sim-clock");
  if (!el || !simulationDate) return;
  el.textContent = simulationDate.toLocaleDateString(undefined, {
    year:  'numeric',
    month: 'short',
    day:   'numeric'
  });
}

// Build the in-game HUD and wire up toolbar
// sidebar.js

export function buildGameSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = `
    <!-- 1) Settings at top -->
    <button id="settings-btn-sidebar" class="time-btn">Settings</button>

    <!-- 2) Time box below settings -->
    <div id="time-box">
      <!-- Date above controls -->
      <span id="sim-clock" class="toolbar-date"></span>
      <!-- Speed buttons -->
      <div id="time-controls">
        <button data-speed="0"  class="time-btn">❚❚</button>
        <button data-speed="1"  class="time-btn">1×</button>
        <button data-speed="3"  class="time-btn">3×</button>
        <button data-speed="10" class="time-btn">10×</button>
      </div>
    </div>

    <!-- 3) Then the player country header -->
    <h2 id="in-game-header"></h2>
    <section id="decision-panel"></section>
    <section id="diplomacy-panel">
      <h3>Diplomacy</h3>
      <div id="other-country-info"></div>
    </section>
  `;

  // Populate country name
  document.getElementById("in-game-header").textContent =
    state.countryData[state.gameState.playerCountryId].name;

  // Build empty dropdowns (unchanged)…
  const decision = document.getElementById("decision-panel");
  ["Population","GDP","Science","Military"].forEach(factor => {
    const div = document.createElement("div");
    div.classList.add("dropdown");
    div.innerHTML = `
      <button class="dropbtn">${factor}</button>
      <div class="dropdown-content">
        <p>No ${factor} decisions yet.</p>
      </div>`;
    decision.appendChild(div);
  });

  // Diplomacy placeholder
  document.getElementById("other-country-info")
    .textContent = "Click another country to inspect it.";

  // ── Wire up the Settings button ───────────────────
  document.getElementById("settings-btn-sidebar")
    .addEventListener("click", () =>
      document.getElementById("settings-modal").classList.remove("hidden")
    );

  // ── Wire up time-control buttons ───────────────────
  const tb = sidebar.querySelector("#time-box");
  // 1) Start paused
  tb.querySelector("[data-speed='0']").classList.add("active");

  // 2) Click handlers
  tb.querySelectorAll(".time-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const speed = Number(btn.dataset.speed);
      if (speed === 0) pauseTimer();
      else {
        setTimeScale(speed);
        startTimer();
      }
      // highlight active
      tb.querySelectorAll(".time-btn")
        .forEach(b => b.classList.toggle("active", b === btn));
    });
  });
}


// Called once the player confirms selection
export function startGame() {
  resetSimulationDate();  
  state.gameState.playerCountryId = state.confirmedCountryId;
  state.gameState.control[state.confirmedCountryId] = 100;
  buildGameSidebar();
  updateClockDisplay();
}
