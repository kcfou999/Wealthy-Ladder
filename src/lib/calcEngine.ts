import type { DistributionData } from '@/types/distribution';

/** Ordered list of known percentile anchors used for interpolation. */
const KNOWN_PERCENTILES: Array<{ pct: number; key: keyof DistributionData }> = [
  { pct: 10, key: 'p10' },
  { pct: 25, key: 'p25' },
  { pct: 50, key: 'p50' },
  { pct: 75, key: 'p75' },
  { pct: 90, key: 'p90' },
  { pct: 95, key: 'p95' },
  { pct: 99, key: 'p99' },
];

/**
 * Calculate the percentile rank of a value within a discrete distribution.
 *
 * Three interpolation regimes:
 *
 * **Regime 1 — Below P10 (linear)**
 * `PR = (x / p10) × 10`
 * Special case when `p10 = 0` (e.g. net worth for young cohorts): values ≤ 0
 * return 0; positive values below p25 use `(x / p25) × 25`.
 *
 * **Regime 2 — P10 to P90 (log-linear)**
 * Find the two surrounding known breakpoints [L, U] then:
 * `PR = pct_L + (pct_U - pct_L) × (ln(x) - ln(L)) / (ln(U) - ln(L))`
 * Zero-valued anchors are filtered out before bracket search to avoid ln(0).
 *
 * **Regime 3 — Above P90 (Pareto tail)**
 * Fit a conditional Pareto distribution using P90 and P99 as anchors.
 * `α = ln(0.1) / ln(p90 / p99)`
 * Conditional CDF within the top 10%: `F(x) = 1 − (p90/x)^α`
 * Absolute PR: `PR = 90 + 10 × F(x)`
 * Boundary check: at x=p90, F=0 → PR=90; at x=p99, F=0.9 → PR=99; x→∞ → PR→100.
 *
 * @param inputValue - User value in the distribution's native currency.
 * @param distribution - Percentile breakpoints for the relevant cohort/metric.
 * @returns Percentile rank clamped to [0, 99.99].
 *
 * @example
 * // Test 1: Middle income — P50 input returns ~50
 * // Taiwan 30-34 income: p50 = 520,000 TWD
 * // calculatePR(520000, taiwan3034Income) → ~50.0
 *
 * @example
 * // Test 2: Extreme high net worth returns 99.99
 * // calculatePR(200_000_000, taiwan3539NW) → 99.99
 *
 * @example
 * // Test 3: Low income below P10 returns < 10
 * // Taiwan 35-39 income: p10 = 300,000 TWD; input = 150,000
 * // calculatePR(150000, taiwan3539Income) → ~5.0
 */
export function calculatePR(
  inputValue: number,
  distribution: DistributionData
): number {
  const { p10, p25, p90, p99 } = distribution;

  // ── Regime 1: Non-positive inputs ────────────────────────────────────────
  if (inputValue <= 0) return 0;

  // ── Regime 1: p10 = 0 special case (net worth for young cohorts) ─────────
  if (p10 === 0) {
    if (inputValue < p25) {
      if (p25 <= 0) return 0;
      // Linear interpolation in value space (log is undefined at 0)
      return clamp((inputValue / p25) * 25);
    }
    // Falls through to Regime 2 — first positive anchor is p25
  } else if (inputValue < p10) {
    // ── Regime 1: Standard below-P10 linear interpolation ──────────────────
    return clamp((inputValue / p10) * 10);
  }

  // ── Regime 3: Pareto tail above P90 ──────────────────────────────────────
  if (inputValue >= p90) {
    if (p99 <= p90) return clamp(90); // degenerate data guard

    // α = ln(0.1) / ln(p90/p99)
    // Both ln(0.1) and ln(p90/p99) are negative, yielding α > 0.
    const alpha = Math.log(0.1) / Math.log(p90 / p99);
    // Conditional CDF within top 10%: F(x) = 1 - (p90/x)^α
    // Absolute PR = 90 + 10 × F(x)
    // Boundary: at x=p90 → PR=90; at x=p99 → PR=99; x→∞ → PR→100.
    const conditionalCDF = 1 - Math.pow(p90 / inputValue, alpha);
    return clamp(90 + 10 * conditionalCDF);
  }

  // ── Regime 2: Log-linear interpolation between known breakpoints ──────────
  // Filter zero-valued anchors to prevent Math.log(0) = -Infinity errors.
  const anchors = KNOWN_PERCENTILES.map(({ pct, key }) => ({
    pct,
    val: distribution[key],
  })).filter(({ val }) => val > 0);

  let lower = anchors[0];
  let upper = anchors[anchors.length - 1];

  for (let i = 0; i < anchors.length - 1; i++) {
    if (inputValue >= anchors[i].val && inputValue <= anchors[i + 1].val) {
      lower = anchors[i];
      upper = anchors[i + 1];
      break;
    }
  }

  if (lower.val === upper.val) return clamp(lower.pct);

  const pr =
    lower.pct +
    (upper.pct - lower.pct) *
      ((Math.log(inputValue) - Math.log(lower.val)) /
        (Math.log(upper.val) - Math.log(lower.val)));

  return clamp(pr);
}

/** Clamps a percentile rank to the valid output range [0, 99.99]. */
function clamp(pr: number): number {
  return Math.min(99.99, Math.max(0, pr));
}
