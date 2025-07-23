const svg = d3.select("#map");
const g = svg.append("g");
const tooltip = d3.select("#tooltip");

let countryData = {};

Promise.all([
  fetch('./data/world.geojson').then(res => res.json()),
  fetch('./data/countries.json').then(res => res.json())
]).then(([world, countries]) => {
  countryData = countries;

  function updateSidebar(data) {
    document.getElementById("country-name").textContent = data.name;
    document.getElementById("country-population").textContent = `Population: ${formatCompactNumber(data.population)}`;
    document.getElementById("country-gdp").textContent = `GDP: $${formatCompactNumber(data.GDP * 1_000_000)}`;
    document.getElementById("country-science").textContent = `Science: ${formatCompactNumber(data.science)}`;
    if (data.military_power !== undefined) {
      document.getElementById("country-military").textContent = `Military Power: ${formatCompactNumber(data.military_power)}`;
    }
  }

  function formatCompactNumber(num) {
    if (typeof num !== "number" || isNaN(num)) return "—";
    if (num < 1_000) return num.toString();
    if (num < 1_000_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + "K";
    if (num < 1_000_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + "M";
    if (num < 1_000_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + "B";
    return (num / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '') + "T";
  }

  // set up viewport + projection
  const viewport = document.getElementById("map-viewport");
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  svg.attr("width", width).attr("height", height);
  const projection = d3.geoNaturalEarth1().fitSize([width, height], world);
  const path = d3.geoPath().projection(projection);

  // 1) Merge duplicated ISO shapes (Somalia/Somaliland etc)
  const grouped = d3.group(world.features, d =>
    d.properties.iso_a3 || d.properties.ISO_A3 || d.properties.adm0_a3 || "UNKNOWN"
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

  // 2) Build a rainbow color scale for every country
  const isoList   = mergedFeatures.map(d => d.properties.iso_a3);
  const colorScale = d3.scaleOrdinal()
    .domain(isoList)
    .range(isoList.map((_, i) => d3.interpolateRainbow(i / isoList.length)));

  // 3) Draw country fills (interactive layer)
  g.selectAll("path.country")
    .data(mergedFeatures)
    .enter()
    .append("path")
      .attr("class", "country")
      .attr("d", path)
      .attr("id", d => d.properties.iso_a3)
      .attr("fill", d => colorScale(d.properties.iso_a3))
      .attr("stroke", "none")
    .on("mouseover", (event, d) => {
      tooltip.style("display", "block").text(d.properties.ADMIN);
    })
    .on("mousemove", event => {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", () => {
      tooltip.style("display", "none");
    })
    .on("click", (event, d) => {
      const iso   = d.properties.iso_a3;
      const data  = countryData[iso];
      if (data) {
        updateSidebar(data);
      } else {
        updateSidebar({ name: d.properties.ADMIN, population: 0, GDP: 0, science: 0 });
      }
    });

  // 4) Draw borders on top (non-interactive)
  g.selectAll("path.border")
    .data(mergedFeatures)
    .enter()
    .append("path")
      .attr("class", "border")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#000")
      .attr("stroke-width", 0.4)
      .attr("pointer-events", "none");

  // 5) Add zoom/pan
  svg.call(d3.zoom()
    .scaleExtent([0.5, 8])
    .on("zoom", event => g.attr("transform", event.transform))
  );
});
