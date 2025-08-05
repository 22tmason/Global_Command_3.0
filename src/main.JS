// src/main.JS
import { initMap } from "./map.js";
import { resetSimulationDate } from "./timer.js";
import { buildGameSidebar, startGame } from "./sidebar.js";
import { state } from "./state.js";

// DOM refs
const menuScreen  = document.getElementById("menu-screen");
const mainArea    = document.getElementById("main-area");
const newGameBtn  = document.getElementById("new-game-btn");
const loadGameBtn = document.getElementById("load-game-btn");
const settingsBtn = document.getElementById("settings-btn");
const sidebar    = document.getElementById('sidebar');

// Hide until start
mainArea.style.display = "none";

newGameBtn.addEventListener("click", () => {
  menuScreen.style.display = "none";
  mainArea.style.display   = "flex";

  Promise.all([
    fetch("./data/world.geojson").then(r => r.json()),
    fetch("./data/countries.json").then(r => r.json())
  ]).then(([world, countries]) => {
    // 1) seed country data
    Object.assign(state.countryData, countries);
    // 2) reset clock
    resetSimulationDate();
    // 3) render map (this hooks up confirm→startGame for you)
    initMap(world, countries);
  });
});

loadGameBtn.addEventListener("click", () => {
  alert("Load Game not implemented yet!");
});

settingsBtn.addEventListener("click", () => {
  alert("Settings not implemented yet!");
});
