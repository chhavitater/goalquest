// middleware/scoring.js – Score computation matching the BRD formulas

function computeScore(uom, target, actual) {
  if (actual === null || actual === undefined) return null;
  const a = parseFloat(actual);
  const t = parseFloat(target);
  if (isNaN(a) || isNaN(t) || t === 0) return null;

  switch (uom) {
    case "Zero-based":
      return a === 0 ? 100 : 0;
    case "Timeline":
      // actual = days taken, target = deadline days
      return a <= t ? 100 : Math.max(0, 100 - (a - t) * 10);
    case "Numeric (Min)":
    case "% (Min)":
      return Math.min(150, Math.round((a / t) * 100));
    case "Numeric (Max)":
    case "% (Max)":
      return a === 0 ? 0 : Math.min(150, Math.round((t / a) * 100));
    default:
      return null;
  }
}

module.exports = { computeScore };
