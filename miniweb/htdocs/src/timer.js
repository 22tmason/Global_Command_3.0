// timer.js
import { updateClockDisplay } from "./sidebar.js";

// current speed: days per real second
export let timeScale = 1;
export let simulationDate = null;

let gameTimer = null;

// Initialize or reset the clock
export function resetSimulationDate(date = new Date()) {
  simulationDate = date;
  updateClockDisplay();
}

// Start ticking: 1 day per “tick”
export function startTimer() {
  // clear any existing loop
  if (gameTimer) clearInterval(gameTimer);

  // if paused, do nothing
  if (timeScale <= 0) {
    gameTimer = null;
    return;
  }

  // interval = 1000 ms / speed
  const interval = 1000 / timeScale;

  gameTimer = setInterval(() => {
    // advance exactly one day each tick
    simulationDate.setDate(simulationDate.getDate() + 1);
    updateClockDisplay();
  }, interval);
}

// Stop the loop
export function pauseTimer() {
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = null;
}

// Change speed (0 = pause, >0 = days/sec)
export function setTimeScale(newScale) {
  timeScale = newScale;
  if (gameTimer !== null) {
    startTimer();
  }
}
