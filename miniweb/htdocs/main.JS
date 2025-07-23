// main.js

import * as d3Module from "https://cdn.skypack.dev/d3@7";
const d3 = d3Module;
const turf = window.turf;

// === Globals & DOM refs ===
// Map & sidebar
const svg         = d3.select("#map");
const g           = svg.append("g");
const tooltip     = d3.select("#tooltip");
const mainArea    = document.getElementById("main-area");
const confirmBtn  = document.getElementById("confirm-btn");

// Menu buttons
const menuScreen     = document.getElementById("menu-screen");
const newGameBtn     = document.getElementById("new-game-btn");
const loadGameBtn    = document.getElementById("load-game-btn");
const settingsBtn    = document.getElementById("settings-btn");

let countryData      = {};
let pendingCountryId = null;
let confirmedCountryId = localStorage.getItem("selectedCountry") || null;

// Hide the main UI until “New Game” is clicked
mainArea.style.display = "none";

// === Menu button handlers ===
// New Game → hide menu, show main UI, start the map
newGameBtn.addEventListener("click", () => {
  menuScreen.style.display = "none";
  mainArea.style.display   = "flex";
  initGame();
});

// TODO: hook up your own load/save logic here
loadGameBtn.addEventListener("click", () => {
  alert("Load Game not implemented yet!");
});

// TODO: hook up your own settings panel here
settingsBtn.addEventListener("click", () => {
  alert("Settings not implemented yet!");
});

// === initGame: load data and render map & sidebar ===
function initGame() {
  Promise.all([
    fetch('./data/world.geojson').then(r => r.json()),
    fetch('./data/countries.json').then(r => r.json())
  ]).then(([world, countries]) => {
    countryData = countries;

    // --- Sidebar updater ---
    function updateSidebar(data) {
      document.getElementById("country-name").textContent       = data.name;
      document.getElementById("country-population").textContent = formatCompactNumber(data.population);
      document.getElementById("country-gdp").textContent        = `$${formatCompactNumber(data.GDP * 1_000_000)}`;
      document.getElementById("country-science").textContent    = formatCompactNumber(data.science);
      document.getElementById("country-military").textContent   = formatCompactNumber(data.military_power);
    }

    // --- Number formatter ---
    function formatCompactNumber(num) {
      if (typeof num !== "number" || isNaN(num)) return "—";
      if (num < 1_000)             return num.toString();
      if (num < 1_000_000)         return (num/1_000).toFixed(1).replace(/\.0$/,'') + "K";
      if (num < 1_000_000_000)     return (num/1_000_000).toFixed(1).replace(/\.0$/,'') + "M";
      if (num < 1_000_000_000_000) return (num/1_000_000_000).toFixed(1).replace(/\.0$/,'') + "B";
      return (num/1_000_000_000_000).toFixed(1).replace(/\.0$/,'') + "T";
    }

    // --- Viewport & projection setup ---
    const vp     = document.getElementById("map-viewport");
    const width  = vp.clientWidth;
    const height = vp.clientHeight;
    svg.attr("width", width).attr("height", height);
    const projection = d3.geoNaturalEarth1().fitSize([width, height], world);
    const path       = d3.geoPath().projection(projection);

    // --- Merge multi-part countries (Somaliland etc) ---
    const grouped = d3.group(world.features, f =>
      f.properties.iso_a3 || f.properties.ISO_A3 || f.properties.adm0_a3 || "UNKNOWN"
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

    // --- Build a rainbow color scale ---
    const isoList    = mergedFeatures.map(d => d.properties.iso_a3);
    const colorScale = d3.scaleOrdinal()
      .domain(isoList)
      .range(isoList.map((_, i) => d3.interpolateRainbow(i / isoList.length)));

    // --- Country preview handler (white-out) ---
    function previewCountry(event, d) {
      // clear prior
      g.selectAll("path.country").classed("pending", false);
      // mark this
      pendingCountryId = d.properties.iso_a3;
      d3.select(this).classed("pending", true);
      // update sidebar and enable confirm
      updateSidebar(countryData[pendingCountryId]);
      confirmBtn.disabled = false;
    }

    // --- Draw countries ---
    g.selectAll("path.country")
      .data(mergedFeatures)
      .enter().append("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("id", d => d.properties.iso_a3)
        .attr("fill", d => colorScale(d.properties.iso_a3))
        .attr("stroke", "none")
        .on("mousemove", event => {
          tooltip.style("display","block")
                 .style("left", (event.pageX+10)+"px")
                 .style("top",  (event.pageY+10)+"px");
        })
        .on("mouseout", () => tooltip.style("display","none"))
        .on("click", previewCountry);

    // --- Confirm selection logic ---
    confirmBtn.addEventListener("click", () => {
      if (!pendingCountryId) return;
      // clear old
      g.selectAll("path.country").classed("selected", false);
      // mark new
      confirmedCountryId = pendingCountryId;
      localStorage.setItem("selectedCountry", confirmedCountryId);
      g.select(`#${confirmedCountryId}`).classed("selected", true);
      // reset
      pendingCountryId = null;
      g.selectAll("path.country").classed("pending", false);
      confirmBtn.disabled = true;
    });

    // --- Restore any prior selection ---
    if (confirmedCountryId) {
      g.selectAll("path.country")
        .filter(d => d.properties.iso_a3 === confirmedCountryId)
        .classed("selected", true)
        .each(() => updateSidebar(countryData[confirmedCountryId]));
    }

    // --- Draw borders (non-interactive) ---
    g.selectAll("path.border")
      .data(mergedFeatures)
      .enter().append("path")
        .attr("class","border")
        .attr("d",path)
        .attr("fill","none")
        .attr("stroke","#000")
        .attr("stroke-width",0.4)
        .attr("pointer-events","none");

    // --- Zoom & pan ---
    svg.call(d3.zoom()
      .scaleExtent([0.5,8])
      .on("zoom", e => g.attr("transform", e.transform)));
  });
}
