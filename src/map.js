// map.js
import * as d3 from "https://cdn.skypack.dev/d3@7";
import { state } from "./state.js";
import { formatCompactNumber } from "./utilities.js";
import { startGame } from "./sidebar.js";

function getShowPopup() {
  if (typeof window.showPopup === "function") return window.showPopup;

  // Minimal fallback modal
  return function (title, body) {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:10000";
    const box = document.createElement("div");
    box.style.cssText =
      "max-width:560px;width:min(90vw,560px);background:#1f1f22;color:#fff;border:1px solid #FFD166;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.5);padding:20px";
    const h = document.createElement("h3");
    h.textContent = title;
    h.style.margin = "0 0 10px 0";
    const p = document.createElement("p");
    p.textContent = body;
    p.style.margin = "0 0 16px 0";
    const btn = document.createElement("button");
    btn.textContent = "OK";
    btn.style.cssText =
      "background:#FFD166;border:none;color:#000;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600";
    btn.onclick = () => document.body.removeChild(overlay);
    box.append(h, p, btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  };
}

const turf = window.turf;

// shared handles used across functions
let g;              // <g> container
let colorScale;     // country palette

/**
 * Paint the player's country black and restore others to their palette color.
 * Call after confirming a country or after loading a save.
 */
export function paintPlayerCountryBlack() {
  if (!g || !colorScale) return;
  const pid = state?.gameState?.playerCountryId || state?.confirmedCountryId;
  g.selectAll("path.country")
    .attr("fill", d => (d.properties.iso_a3 === pid ? "#000" : colorScale(d.properties.iso_a3)))
    .classed("player", d => d.properties.iso_a3 === pid);
}

/**
 * Initialise the world map, bind interactions, and wire it to the sidebar.
 * @param {GeoJSON.FeatureCollection} world
 * @param {Object<string, {name:string, population:number, GDP:number, science?:number, military_power?:number}>} countries
 */
export function initMap(world, countries) {
  // ---------- 0) Seed country data ----------
  Object.assign(state.countryData, countries);

  // ---------- 1) Projection & SVG ----------
  const vp     = document.getElementById("map-viewport");
  const width  = vp.clientWidth;
  const height = vp.clientHeight;

  const svg = d3.select("#map")
    .attr("width",  width)
    .attr("height", height);

  g = svg.append("g"); // assign to module-level variable

  const projection = d3.geoNaturalEarth1().fitSize([width, height], world);
  const path       = d3.geoPath().projection(projection);

  // ---------- 2) Merge multipart features by ISO code ----------
  const grouped = d3.group(
    world.features,
    f => f.properties.iso_a3 || f.properties.ISO_A3 || f.properties.adm0_a3 || "UNKNOWN"
  );

  /** @type {GeoJSON.Feature[]} */
  const mergedFeatures = [];
  for (const [iso, group] of grouped) {
    if (group.length === 1) {
      mergedFeatures.push(group[0]);
    } else {
      const merged = turf.combine({
        type: "FeatureCollection",
        features: group
      }).features[0];
      merged.properties = { ...group[0].properties, iso_a3: iso };
      mergedFeatures.push(merged);
    }
  }
  getShowPopup()(
    "Welcome to Global Command",
    "Click a country to preview it, then press Confirm to start. Once in-game, use the Economy, Diplomacy, and Military tabs to shape your strategy."
  );
  // ---------- 3) Colour scale ----------
  const isoList = mergedFeatures.map(d => d.properties.iso_a3);
  colorScale = d3.scaleOrdinal() // assign to module-level variable
    .domain(isoList)
    .range(isoList.map((_, i) => d3.interpolateRainbow(i / Math.max(1, isoList.length))));

  // ---------- Helpers (use module-level g/colorScale) ----------
  function updateSidebar(data = {}) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("country-name",        data.name ?? "—");
    set("country-population",  formatCompactNumber(data.population ?? 0));
    set("country-gdp",        `$${formatCompactNumber((data.GDP ?? 0) * 1e6)}`);
    set("country-science",     formatCompactNumber(data.science ?? 0));
    set("country-military",    formatCompactNumber(data.military_power ?? 0));
  }

  function previewCountry(event, d) {
    g.selectAll("path.country").classed("pending", false);
    state.pendingCountryId = d.properties.iso_a3;
    d3.select(this).classed("pending", true);
    updateSidebar(state.countryData[state.pendingCountryId] || {});
    const btn = document.getElementById("confirm-btn");
    if (btn) btn.disabled = false;
  }

  function markDiploTarget(id) {
    g.selectAll("path.country").classed("diplo-target", false);
    if (id) g.select(`#${id}`).classed("diplo-target", true);
  }
  window.markDiploTarget = markDiploTarget;

  function updateMapControl() {
    const ctrl = state.gameState?.control || {};
    g.selectAll("path.country")
      .classed("controlled", d => (ctrl[d.properties.iso_a3] || 0) >= 100);
    paintPlayerCountryBlack();
  }
  window.updateMapControl = updateMapControl;

  // ---------- 4) Draw countries ----------
  g.selectAll("path.country")
    .data(mergedFeatures)
    .enter().append("path")
      .attr("class", "country")
      .attr("id", d => d.properties.iso_a3)
      .attr("d", path)
      .attr("fill", d => colorScale(d.properties.iso_a3))
      .on("click", function (event, d) {
        const iso = d.properties.iso_a3;

        // If game hasn't started: use pre-game confirm flow
        if (!state.gameState?.playerCountryId) {
          return previewCountry.call(this, event, d);
        }

        // In-game: clicking selects diplomacy target
        state.gameState.selectedDiploTarget = iso;
        markDiploTarget(iso);

        if (typeof window.setSelectedCountry === "function") {
          window.setSelectedCountry(iso);
        } else {
          document.dispatchEvent(new CustomEvent("gc:countrySelected", { detail: { id: iso } }));
        }

        document.getElementById("mode-diplomacy")?.click?.();
      })
      .on("mousemove", evt => {
        d3.select("#tooltip")
          .style("display", "block")
          .style("left", (evt.pageX + 10) + "px")
          .style("top",  (evt.pageY + 10) + "px");
      })
      .on("mouseout", () => d3.select("#tooltip").style("display", "none"));

  // ---------- 5) Confirm → startGame ----------
  const confirmBtn = document.getElementById("confirm-btn");
  confirmBtn?.addEventListener("click", () => {
    if (!state.pendingCountryId) return;

    g.selectAll("path.country").classed("selected", false);

    state.confirmedCountryId = state.pendingCountryId;
    localStorage.setItem("selectedCountry", state.confirmedCountryId);
    g.select(`#${state.confirmedCountryId}`).classed("selected", true);

    state.pendingCountryId = null;
    g.selectAll("path.country").classed("pending", false);
    confirmBtn.disabled = true;

    // Start the game (sidebar + timers)
    startGame();

    // Paint current player and control state
    paintPlayerCountryBlack();
    updateMapControl();

    // Reset target highlight; user will click a target
    state.gameState.selectedDiploTarget = null;
    markDiploTarget(null);

    // ---------- Post-confirm onboarding popup ----------
    // ... after startGame(), paintPlayerCountryBlack(), etc.
    getShowPopup()(
      "Game Started",
      "You’re now leading your nation. • Economy: set tax/consumption/investment. • Diplomacy: click other countries to interact (Aid, NAP, Alliance, War). • Military: set budget & draft. Tip: hover labels for tooltips."
    );
  });

  // ---------- 6) Restore prior selection (if any) ----------
  const stored = state.confirmedCountryId || localStorage.getItem("selectedCountry");
  if (stored) {
    g.selectAll("path.country")
      .filter(d => d.properties.iso_a3 === stored)
      .classed("selected", true)
      .each(() => {
        const data = state.countryData[stored];
        if (data) updateSidebar(data);
      });

    // Only paint black if a player is actually set (game started / loaded)
    if (state.gameState?.playerCountryId) {
      paintPlayerCountryBlack();
      updateMapControl();
    }
  }

  // ---------- 7) Borders ----------
  g.selectAll("path.border")
    .data(mergedFeatures)
    .enter().append("path")
      .attr("class", "border")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#000")
      .attr("stroke-width", 0.4)
      .attr("pointer-events", "none");

  // ---------- 8) Zoom & Pan ----------
  svg.call(
    d3.zoom()
      .scaleExtent([0.5, 8])
      .on("zoom", e => g.attr("transform", e.transform))
  );
}
