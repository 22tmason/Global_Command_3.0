// leaderboard.js
import { state } from "./state.js";
import { formatCompactNumber } from "./utilities.js";

const _prevScore = Object.create(null);
const PERSONA_LABELS = {
  balanced: "Balanced",
  growth:   "Growth",
  hawk:     "Hawk",
  volatile: "Volatile",
};
/** Ensure the container exists (top-right floating panel) */
export function mountLeaderboardContainer() {
  if (document.getElementById("leaderboard")) return;

  const box = document.createElement("div");
  box.id = "leaderboard";
  box.className = "leaderboard";

  const list = document.createElement("ul");
  list.id = "leaderboard-list";
  box.appendChild(list);

  document.body.appendChild(box);
}

/** Pull a best-effort, live snapshot for a country */
function snapshotForCountry(id) {
  // Player: prefer live econ if available via a helper exposed by sidebar.js
  if (id === String(state?.gameState?.playerCountryId) && typeof window.getLiveCountrySnapshot === "function") {
    const live = window.getLiveCountrySnapshot();
    if (live) return live;
  }

  // Fallback: static data (GDP is in millions in your dataset)
  const d = state.countryData?.[id] || {};
  const pop = Number(d.population) || 0;
  const gdp = (Number(d.GDP) || 0) * 1e6; // convert M → absolute
  const mil = Number(d.military_power) || 0; // treat as "power" baseline
  return { population: pop, GDP: gdp, militaryPower: mil, name: d.name || id };
}

/** Compute composite score */
function computeScore({ population, GDP, militaryPower }) {
  return (militaryPower + population + GDP) / 100;
}

/** Render the list */
export function updateLeaderboard() {
  const listEl = document.getElementById("leaderboard-list");
  if (!listEl) return;

  const entries = Object.keys(state.countryData || {}).map((id) => {
    const snap = snapshotForCountry(id);
    const score = computeScore(snap);
    const prev = _prevScore[id];
    const growthYr = prev > 0 ? Math.pow(score / prev, 365) - 1 : null;
    _prevScore[id] = score;
    return {
      id,
      name: snap.name || state.countryData[id]?.name || id,
      score,
      GDP: snap.GDP,
      population: snap.population,
      militaryPower: snap.militaryPower,
      persona: state.countryData[id]?.persona || null,
      growthYr,
    };
  });

  // Sort by score descending
  entries.sort((a, b) => b.score - a.score);

  // Keep top 10 but always include the player even if outside top 10
  const pid = String(state?.gameState?.playerCountryId ?? "");
  const top = entries.slice(0, 10);
  if (pid && !top.find((e) => e.id === pid)) {
    const me = entries.find((e) => e.id === pid);
    if (me) top.push(me);
  }

  // Paint
    listEl.innerHTML = "";
    top.forEach((e) => {
    const li = document.createElement("li");
    li.className = (e.id === pid) ? "me" : "";

    const pct = (e.growthYr == null) ? "—" : ((e.growthYr * 100).toFixed(2) + "% /yr");
    const personaBadge = e.persona ? `<span class="persona p-${e.persona}">${PERSONA_LABELS[e.persona]||e.persona}</span>` : "";
    li.innerHTML = `
        <span class="name">${e.name} ${personaBadge}</span>
        <span class="score">
        ${formatCompactNumber(e.score)}
        <small class="growth">${pct}</small>
        </span>
    `;

    listEl.appendChild(li);
    });
}

/** Optional: gentle throttling if called frequently */
let _rafScheduled = false;
export function scheduleLeaderboardUpdate() {
  if (_rafScheduled) return;
  _rafScheduled = true;
  requestAnimationFrame(() => {
    _rafScheduled = false;
    updateLeaderboard();
  });
}
