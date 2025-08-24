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
let g;                      // countries layer (<g>)
let colorScale;             // country palette
let warLayerBack;           // under-glow for links (in the same <g> as countries)
let warLayer;               // foreground war links
let centroidByIso = new Map(); // iso -> [x,y] pixel centroids

/**
 * Build a curved SVG path between two country centroids (quadratic bezier).
 */
function linkPath(aIso, bIso) {
  const A = centroidByIso.get(aIso);
  const B = centroidByIso.get(bIso);
  if (!A || !B) return "";
  const [x1, y1] = A, [x2, y2] = B;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(120, len * 0.25); // curve amount
  const cx = mx - (dy / len) * k;      // perpendicular offset
  const cy = my + (dx / len) * k;
  return `M${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;
}

/**
 * Build the current set of war pairs from the diplomacy matrix.
 */
function currentWarPairs() {
  const rel = state.diplomacy?.relations || {};
  const out = [];
  for (const a in rel) {
    for (const b in rel[a]) {
      if (a < b && rel[a][b]?.atWar) out.push({ a, b, key: `${a}|${b}` });
    }
  }
  return out;
}

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
 * Refresh all war lines (curved links between belligerents).
 */
function linkWidth(aIso, bIso) {
  const aP = Number(state.countryData[aIso]?.military_power) || 0;
  const bP = Number(state.countryData[bIso]?.military_power) || 0;
  const r  = (aP + 1) / (bP + 1);              // avoid div/0
  const w  = 0.2 + Math.min(0.5, Math.abs(Math.log(r)) * 2.2);
  return w;
}

function updateWarLines() {
  if (!warLayer || !warLayerBack) return;

  const pid = String(state?.gameState?.playerCountryId ?? "");
  const data = currentWarPairs().map(d => ({
    ...d,
    path: linkPath(d.a, d.b),
    playerInvolved: (d.a === pid || d.b === pid),
  }));

  warLayer
    .selectAll("path.war-link")
    .data(data, d => d.key)
    .join(
      enter => enter.append("path")
        .attr("class", d => "war-link" + (d.playerInvolved ? " player" : ""))
        .attr("fill", "none")
        .attr("stroke", "#ef5350")
        .attr("stroke-dasharray", "6 8")
        .attr("stroke-width", d => linkWidth(d.a, d.b))
        .attr("d", d => d.path),
      update => update
        .attr("class", d => "war-link" + (d.playerInvolved ? " player" : ""))
        .attr("stroke-width", d => linkWidth(d.a, d.b))
        .attr("d", d => d.path),
      exit => exit.remove()
    );

  // under-glow a bit thicker than the foreground
  warLayerBack
    .selectAll("path.war-link")
    .data(data, d => d.key)
    .join(
      enter => enter.append("path")
        .attr("class", "war-link")
        .attr("fill", "none")
        .attr("stroke", "rgba(0,0,0,.35)")
        .attr("stroke-width", d => linkWidth(d.a, d.b) + 3)
        .attr("d", d => d.path),
      update => update
        .attr("stroke-width", d => linkWidth(d.a, d.b) + 3)
        .attr("d", d => d.path),
      exit => exit.remove()
    );
}

/**
 * Throttle war-line redraws to the next animation frame.
 */
let _warRAF = false;
function scheduleWarLinesUpdate() {
  if (_warRAF) return;
  _warRAF = true;
  requestAnimationFrame(() => {
    _warRAF = false;
    updateWarLines();
  });
}

// expose for other modules
window.updateWarLines = updateWarLines;
window.scheduleWarLinesUpdate = scheduleWarLinesUpdate;

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

  // Clear any prior contents (avoid duplicate maps on re-init)
  d3.select("#map").selectAll("*").remove();

  const svg = d3.select("#map")
    .attr("width",  width)
    .attr("height", height);

  g = svg.append("g"); // assign to module-level variable (countries layer)

  const projection = d3.geoNaturalEarth1().fitSize([width, height], world);
  const path       = d3.geoPath().projection(projection);

  // ---------- 2) Merge multipart features by ISO code ----------
  const grouped = d3.group(
    world.features,
    f => f.properties.iso_a3 || f.properties.ISO_A3 || f.properties.adm0_a3 || "UNKNOWN"
  );

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
  // Build neighbor map (ISO -> [ISO...]) and expose it
  (function buildNeighbors() {
    const byIso = new Map();
    mergedFeatures.forEach(f => byIso.set(f.properties.iso_a3, f));
    const neighbors = {};
    const feats = mergedFeatures;

    // quick bbox prune + precise touch test
    function bboxTouch(b1, b2) {
      return !(b2[0] > b1[2] || b2[2] < b1[0] || b2[1] > b1[3] || b2[3] < b1[1]);
    }

    for (let i = 0; i < feats.length; i++) {
      const a = feats[i], ia = a.properties.iso_a3;
      const ba = turf.bbox(a);
      for (let j = i + 1; j < feats.length; j++) {
        const b = feats[j], ib = b.properties.iso_a3;
        const bb = turf.bbox(b);
        if (!bboxTouch(ba, bb)) continue;
        // treat as neighbors if borders touch/intersect (excluding tiny overlaps at sea)
        if (turf.booleanDisjoint(a, b)) continue;
        (neighbors[ia] ||= []).push(ib);
        (neighbors[ib] ||= []).push(ia);
      }
    }

    window.countryNeighbors = neighbors;         // for console/debug
    if (!state.geo) state.geo = {};
    state.geo.neighbors = neighbors;             // AI reads from here
  })();


  getShowPopup()(
    "Welcome to Global Command",
    "Click a country to preview it, then press Confirm to start. Once in-game, use the Economy, Diplomacy, and Military tabs to shape your strategy."
  );

  // ---------- 3) Colour scale ----------
  const isoList = mergedFeatures.map(d => d.properties.iso_a3);
  colorScale = d3.scaleOrdinal()
    .domain(isoList)
    .range(isoList.map((_, i) => d3.interpolateRainbow(i / Math.max(1, isoList.length))));

  // Cache pixel centroids for war line routing
  centroidByIso = new Map();
  mergedFeatures.forEach(f => {
    const iso = f.properties.iso_a3 || f.properties.ISO_A3;
    centroidByIso.set(iso, path.centroid(f));
  });

  // ---------- Helpers (use module-level g/colorScale) ----------
  function updateSidebar(data = {}) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("country-name",        data.name ?? "—");
    set("country-population",  formatCompactNumber(data.population ?? 0));
    set("country-gdp",         `$${formatCompactNumber((data.GDP ?? 0) * 1e6)}`);
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

  // Create war overlay layers above countries (same transformed group)
  warLayerBack = g.append("g").attr("id", "war-links-back");
  warLayer     = g.append("g").attr("id", "war-links");

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

    // First draw of war links (then refreshed daily via war.js)
    if (window.updateWarLines) window.updateWarLines();

    // Post-confirm onboarding popup
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
      if (window.updateWarLines) window.updateWarLines();
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

export function updateDiplomacyStyles() {
  const pid = state?.gameState?.playerCountryId;
  const rels = state?.diplomacy?.relations?.[pid] || {};
  d3.selectAll(".country")
    .classed("enemy", d => !!rels[d.properties.iso_a3]?.atWar)
    .classed("ally",  d => !!rels[d.properties.iso_a3]?.treaties?.alliance);
}
window.updateDiplomacyStyles = updateDiplomacyStyles;
