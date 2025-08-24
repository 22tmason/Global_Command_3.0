// timer.js
import { state } from "./state.js";
import { updateClockDisplay } from "./sidebar.js";

// ----- time controls -----
export let timeScale = 1;                   // days per real second
export let simulationDate = new Date(2025, 0, 1); // default start date
window.simulationDate = simulationDate;     // expose to other modules & console

// integer sim-day counter for AI
if (!state.gameState) state.gameState = {};
state.gameState.simDay = Math.floor(simulationDate.getTime() / 86400000);

let gameTimer = null;

// Advance the world by N sim-days (1 by default)
export function advanceDays(days = 1) {
  // 1) advance the clock
  simulationDate.setDate(simulationDate.getDate() + days);
  window.simulationDate = simulationDate;
  state.gameState.simDay += days;

  // 2) run per-day systems
  if (window.advanceEconomy)       window.advanceEconomy(days);
  if (window.updateEconomy)        window.updateEconomy();
  if (window.handleSimulationTick) window.handleSimulationTick(days);
  if (window.stepWar)              window.stepWar(days);

  // optional: coalesced UI refreshes
  if (window.scheduleLeaderboardUpdate) window.scheduleLeaderboardUpdate();
  if (window.scheduleWarLinesUpdate)    window.scheduleWarLinesUpdate();

  // 3) update the UI date label
  if (typeof updateClockDisplay === "function") updateClockDisplay(simulationDate);
}

// Initialize or reset the clock (call on New Game / Load)
export function resetSimulationDate(date = new Date(2025, 0, 1)) {
  simulationDate = new Date(date.getTime());
  window.simulationDate = simulationDate;
  state.gameState.simDay = Math.floor(simulationDate.getTime() / 86400000);
  if (typeof updateClockDisplay === "function") updateClockDisplay(simulationDate);
}

// Start the loop
export function startTimer() {
  pauseTimer();
  if (timeScale <= 0) return;
  const interval = 1000 / timeScale;   // 1 tick = 1 sim-day
  gameTimer = setInterval(() => advanceDays(1), interval);
}

// Stop the loop
export function pauseTimer() {
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = null;
}

// Change speed (0 = pause, >0 = days/sec)
export function setTimeScale(newScale) {
  timeScale = Number(newScale) || 0;
  if (gameTimer !== null) startTimer(); // restart with new cadence
}

// (optional) expose for console/testing
window.advanceDays = advanceDays;
