// utilities.js
// compact-number formatter
export function formatCompactNumber(num) {
  if (typeof num !== "number" || isNaN(num)) return "—";

  const sign = num < 0 ? "-" : "";
  const absNum = Math.abs(num);
  
  if (absNum < 1_000)             return sign + absNum.toString();
  if (absNum < 1_000_000)         return sign + (absNum/1_000).toFixed(1).replace(/\.0$/,'') + "K";
  if (absNum < 1_000_000_000)     return sign + (absNum/1_000_000).toFixed(1).replace(/\.0$/,'') + "M";
  if (absNum < 1_000_000_000_000) return sign + (absNum/1_000_000_000).toFixed(1).replace(/\.0$/,'') + "B";
  return sign + (absNum/1_000_000_000_000).toFixed(1).replace(/\.0$/,'') + "T";
}