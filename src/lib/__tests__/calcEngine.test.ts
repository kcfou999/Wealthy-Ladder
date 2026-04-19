import { calculatePR } from '@/lib/calcEngine';
import type { DistributionData } from '@/types/distribution';

const taiwan3034Income: DistributionData = {
  p10: 260000,
  p25: 380000,
  p50: 520000,
  p75: 720000,
  p90: 950000,
  p95: 1150000,
  p99: 2100000,
};

const taiwan3539NW: DistributionData = {
  p10: 100000,
  p25: 600000,
  p50: 2800000,
  p75: 7000000,
  p90: 14000000,
  p95: 22000000,
  p99: 55000000,
};

const taiwan3539Income: DistributionData = {
  p10: 300000,
  p25: 440000,
  p50: 600000,
  p75: 840000,
  p90: 1100000,
  p95: 1350000,
  p99: 2600000,
};

describe('calculatePR', () => {
  // Test 1: Middle income — P50 value should return approximately 50
  test('middle income earner at P50 returns ~50', () => {
    const pr = calculatePR(520000, taiwan3034Income);
    expect(pr).toBeGreaterThanOrEqual(40);
    expect(pr).toBeLessThanOrEqual(60);
  });

  // Test 2: High-net-worth individual well above P99 returns > 99
  test('high net worth far above P99 returns PR > 99', () => {
    const pr = calculatePR(200_000_000, taiwan3539NW);
    expect(pr).toBeGreaterThan(99);
    expect(pr).toBeLessThanOrEqual(99.99);
  });

  // Clamp test: astronomically large value is clamped to 99.99
  test('astronomically large net worth is clamped to 99.99', () => {
    const pr = calculatePR(1_000_000_000_000, taiwan3539NW);
    expect(pr).toBe(99.99);
  });

  // Test 3: Low income below P10 returns a PR under 10
  test('low income below P10 returns PR < 10', () => {
    const pr = calculatePR(150000, taiwan3539Income);
    expect(pr).toBeGreaterThan(0);
    expect(pr).toBeLessThan(10);
  });

  // Additional edge-case guards
  test('zero input returns 0', () => {
    expect(calculatePR(0, taiwan3034Income)).toBe(0);
  });

  test('negative input returns 0', () => {
    expect(calculatePR(-50000, taiwan3034Income)).toBe(0);
  });

  test('exactly P90 triggers Pareto regime and returns ~90', () => {
    const pr = calculatePR(950000, taiwan3034Income);
    expect(pr).toBeGreaterThanOrEqual(89);
    expect(pr).toBeLessThanOrEqual(91);
  });

  test('net worth with p10=0 and small positive value returns < 25', () => {
    const nwDist: DistributionData = {
      p10: 0,
      p25: 50000,
      p50: 350000,
      p75: 1200000,
      p90: 3000000,
      p95: 5000000,
      p99: 12000000,
    };
    const pr = calculatePR(25000, nwDist);
    expect(pr).toBeGreaterThan(0);
    expect(pr).toBeLessThan(25);
  });
});
