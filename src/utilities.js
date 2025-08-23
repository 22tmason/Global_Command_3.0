// utilities.js
// compact-number formatter + 2dp controller for tidiness
export function formatCompactNumber(num) {
  if (typeof num !== "number" || isNaN(num)) return "—";

  const sign = num < 0 ? "-" : "";
  const absNum = Math.abs(num);

  function format(n, divisor, suffix) {
    const val = (n / divisor).toFixed(2); // always 2dp
    return sign + val + suffix;
  }

  if (absNum < 1_000)             return sign + absNum.toFixed(2);
  if (absNum < 1_000_000)         return format(absNum, 1_000, "K");
  if (absNum < 1_000_000_000)     return format(absNum, 1_000_000, "M");
  if (absNum < 1_000_000_000_000) return format(absNum, 1_000_000_000, "B");
  return format(absNum, 1_000_000_000_000, "T");
}
