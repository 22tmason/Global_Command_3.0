// utilities.js
// compact-number formatter
export function formatCompactNumber(num) {
  if (typeof num !== "number" || isNaN(num)) return "—";
  if (num < 1_000)             return num.toString();
  if (num < 1_000_000)         return (num/1_000).toFixed(1).replace(/\.0$/,'') + "K";
  if (num < 1_000_000_000)     return (num/1_000_000).toFixed(1).replace(/\.0$/,'') + "M";
  if (num < 1_000_000_000_000) return (num/1_000_000_000).toFixed(1).replace(/\.0$/,'') + "B";
  return (num/1_000_000_000_000).toFixed(1).replace(/\.0$/,'') + "T";
}
