// map.js
import * as d3                  from "https://cdn.skypack.dev/d3@7";
import { state }               from "./state.js";
import { formatCompactNumber } from "./utilities.js";
import { startGame }           from "./sidebar.js";
const turf = window.turf;

export function initMap(world, countries) {
  // Seed the data
  Object.assign(state.countryData, countries);

  // 1) Projection & SVG
  const vp     = document.getElementById("map-viewport");
  const width  = vp.clientWidth;
  const height = vp.clientHeight;
  const svg    = d3.select("#map").attr("width", width).attr("height", height);
  const g      = svg.append("g");
  const projection = d3.geoNaturalEarth1().fitSize([width, height], world);
  const path       = d3.geoPath().projection(projection);

  // 2) Merge multipart features
  const grouped = d3.group(world.features, f =>
    f.properties.iso_a3 || f.properties.ISO_A3 || f.properties.adm0_a3 || "UNKNOWN"
  );
  const mergedFeatures = [];
  for (const [iso, group] of grouped) {
    if (group.length === 1) {
      mergedFeatures.push(group[0]);
    } else {
      const merged = turf.combine({ type: "FeatureCollection", features: group }).features[0];
      merged.properties = { ...group[0].properties, iso_a3: iso };
      mergedFeatures.push(merged);
    }
  }

  // 3) Colour scale
  const isoList = mergedFeatures.map(d => d.properties.iso_a3);
  const colorScale = d3.scaleOrdinal()
    .domain(isoList)
    .range(isoList.map((_, i) => d3.interpolateRainbow(i / isoList.length)));

  // 4) Pre-game sidebar updater
  function updateSidebar(data) {
    document.getElementById("country-name").textContent       = data.name;
    document.getElementById("country-population").textContent = formatCompactNumber(data.population);
    document.getElementById("country-gdp").textContent        = `$${formatCompactNumber(data.GDP * 1e6)}`;
    document.getElementById("country-science").textContent    = formatCompactNumber(data.science);
    document.getElementById("country-military").textContent   = formatCompactNumber(data.military_power);
  }

  // 5) Pre-game preview handler
  function previewCountry(event, d) {
    g.selectAll("path.country").classed("pending", false);
    state.pendingCountryId = d.properties.iso_a3;
    d3.select(this).classed("pending", true);
    updateSidebar(state.countryData[state.pendingCountryId]);
    document.getElementById("confirm-btn").disabled = false;
  }

  // Helper: highlight current diplomacy target in-game
  function markDiploTarget(id) {
    g.selectAll("path.country").classed("diplo-target", false);
    if (id) g.select(`#${id}`).classed("diplo-target", true);
  }

  // 6) Draw countries
  g.selectAll("path.country")
    .data(mergedFeatures)
    .enter().append("path")
      .attr("class", "country")
      .attr("d", path)
      .attr("id", d => d.properties.iso_a3)
      .attr("fill", d => colorScale(d.properties.iso_a3))
      .on("click", function (event, d) {
        const iso = d.properties.iso_a3;

        // If the game hasn't started yet, keep using pre-game preview + confirm flow
        if (!state.gameState?.playerCountryId) {
          return previewCountry.call(this, event, d);
        }

        // In-game: clicking sets the Diplomacy target (no dropdown)
        state.gameState.selectedDiploTarget = iso;
        markDiploTarget(iso);

        // Prefer direct hook if sidebar exposed it, else dispatch an event
        if (typeof window.setSelectedCountry === "function") {
          window.setSelectedCountry(iso);
        } else {
          document.dispatchEvent(new CustomEvent("gc:countrySelected", { detail: { id: iso } }));
        }


        // Switch to Diplomacy tab if present
        const dipBtn = document.getElementById("mode-diplomacy");
        dipBtn?.click?.();
      })
      .on("mousemove", evt => {
        d3.select("#tooltip")
          .style("display", "block")
          .style("left", (evt.pageX + 10) + "px")
          .style("top",  (evt.pageY + 10) + "px");
      })
      .on("mouseout", () => d3.select("#tooltip").style("display", "none"));

  // 7) Confirm → startGame
  document.getElementById("confirm-btn").addEventListener("click", () => {
    if (!state.pendingCountryId) return;
    g.selectAll("path.country").classed("selected", false);

    state.confirmedCountryId = state.pendingCountryId;
    localStorage.setItem("selectedCountry", state.confirmedCountryId);
    g.select(`#${state.confirmedCountryId}`).classed("selected", true);

    state.pendingCountryId = null;
    g.selectAll("path.country").classed("pending", false);
    document.getElementById("confirm-btn").disabled = true;

    startGame();

    // After game starts, default the diplomacy target to any neighbor or first click
    state.gameState.selectedDiploTarget = null;
    markDiploTarget(null);
  });

  // 8) Restore prior selection
  const stored = state.confirmedCountryId || localStorage.getItem("selectedCountry");
  if (stored) {
    g.selectAll("path.country")
      .filter(d => d.properties.iso_a3 === stored)
      .classed("selected", true)
      .each(() => updateSidebar(state.countryData[stored]));
  }

  // 9) Borders
  g.selectAll("path.border")
    .data(mergedFeatures)
    .enter().append("path")
      .attr("class", "border")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#000")
      .attr("stroke-width", 0.4)
      .attr("pointer-events", "none");

  // 10) Zoom & pan
  svg.call(d3.zoom()
    .scaleExtent([0.5, 8])
    .on("zoom", e => g.attr("transform", e.transform))
  );
}
