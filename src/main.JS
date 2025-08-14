// src/main.JS
import { initMap } from "./map.js";
import { resetSimulationDate } from "./timer.js";
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
    Object.assign(state.countryData, countries);
    resetSimulationDate();
    initMap(world, countries);
  });
});

loadGameBtn.addEventListener("click", () => {
  alert("Load Game not implemented yet!");
});

settingsBtn.addEventListener("click", () => {
  alert("Settings not implemented yet!");
});
