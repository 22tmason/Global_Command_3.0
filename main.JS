console.log("JS file loaded!");

const svg = d3.select("#map");
const g = svg.append("g");
const tooltip = d3.select("#tooltip");

let countryData = {};

Promise.all([
  fetch('./data/world.geojson').then(res => res.json()),
  fetch('./data/countries.json').then(res => res.json())
]).then(([world, countries]) => {
  countryData = countries;
  console.log("CountryData keys:", Object.keys(countryData).slice(0,10));


  const viewport = document.getElementById("map-viewport");
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  // Now log, after vars are set:
  console.log("Viewport:", width, height);
  console.log("SVG size (before):", svg.attr("width"), svg.attr("height"));
  console.log("Features:", world.features.length);

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
      const iso = d.properties.ISO_A3 || d.properties.iso_a3 || d.properties.adm0_a3;
      return iso || "UNKNOWN";
    })
    .attr("fill", d => {
      const iso = d.properties.ISO_A3 || d.properties.iso_a3 || d.properties.adm0_a3;
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
      const iso = d.properties.ISO_A3 || d.properties.iso_a3 || d.properties.adm0_a3;
      alert(`You clicked: ${d.properties.ADMIN}\nISO: ${iso}`);
    });
        const zoom = d3.zoom()
    .scaleExtent([0.5, 8])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
    });

    svg.call(zoom);
});
