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
    document.getElementById("country-gdp").textContent = `GDP: $${formatCompactNumber(data.GDP * 1_000_000)}`; // convert M to full $
    document.getElementById("country-science").textContent = `Science: ${formatCompactNumber(data.science)}`;
    if (data.gdp_per_capita !== undefined) {
        document.getElementById("country-gdp-capita").textContent = `GDP/Capita: $${formatCompactNumber(data.gdp_per_capita)}`;
    }
    if (data.military_power !== undefined) {
        document.getElementById("country-military").textContent = `Military Power: ${formatCompactNumber(data.military_power)}`;
    }
    }

    function formatNumber(num) {
    return (typeof num === "number") ? num.toLocaleString() : "—";
    }
    function formatCompactNumber(num) {
    if (typeof num !== "number" || isNaN(num)) return "—";

    if (num < 1_000) {
        return num.toString();
    } else if (num < 1_000_000) {
        return (num / 1_000).toFixed(1).replace(/\.0$/, '') + "K";
    } else if (num < 1_000_000_000) {
        return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + "M";
    } else if (num < 1_000_000_000_000) {
        return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + "B";
    } else {
        return (num / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '') + "T";
    }
    }


  const viewport = document.getElementById("map-viewport");
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  d3.select("#map")
    .attr("width", width)
    .attr("height", height);

  const projection = d3.geoNaturalEarth1().fitSize(
    [width, height],
    world
  );
  const path = d3.geoPath().projection(projection);

  g.selectAll("path")
    .data(world.features)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("id", d => {
      const iso = d.properties.iso_a3 || d.properties.ISO_A3 || d.properties.adm0_a3;

      return iso || "UNKNOWN";
    })
    .attr("fill", d => {
      const iso = d.properties.iso_a3 || d.properties.ISO_A3 || d.properties.adm0_a3;
      const stats = countryData[iso];
      if (!stats) console.warn("No match in countries.json for:", iso);
      return stats ? stats.color : "#555";
    })
    .attr("stroke", "#000")
    .attr("stroke-width", 0.4)
    .on("mouseover", function (event, d) {
      tooltip.style("display", "block")
            .text(d.properties.ADMIN);
    })
    .on("mousemove", function (event) {
      tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", function () {
      tooltip.style("display", "none");
    })
    .on("click", function (event, d) {
    const iso = d.properties.iso_a3 || d.properties.ISO_A3 || d.properties.adm0_a3;
    const admin = d.properties.ADMIN || "Unknown";

    console.log("Clicked country:", admin);
    console.log("ISO code used:", iso);
    console.log("Found in countryData?", !!countryData[iso]);
    if (countryData[iso]) {
        console.log("Data match:", countryData[iso]);
    }

    const data = countryData[iso];
    if (data) {
        updateSidebar(data);
    } else {
        updateSidebar({
        name: admin,
        population: "Unknown",
        GDP: "Unknown",
        science: "Unknown"
        });
    }
    });



        const zoom = d3.zoom()
    .scaleExtent([0.5, 8])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
    });

    svg.call(zoom);
});
