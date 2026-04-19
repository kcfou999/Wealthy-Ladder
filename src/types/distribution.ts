/**
 * Supported geographic/economic benchmark regions.
 */
export type Region = 'Taiwan' | 'Advanced_Economies' | 'Global';

/**
 * The two wealth metrics supported by the calculator.
 */
export type MetricType = 'Annual_Income' | 'Net_Worth';

/**
 * Five-year age brackets covered by the dataset.
 */
export type AgeBracket =
  | '20-24'
  | '25-29'
  | '30-34'
  | '35-39'
  | '40-44'
  | '45-49'
  | '50-54'
  | '55-59'
  | '60-64'
  | 'all';

/**
 * Percentile breakpoints for a single metric within a single age bracket.
 * All values are absolute amounts in the region's native currency
 * (TWD for Taiwan; USD for Advanced_Economies and Global).
 */
export interface DistributionData {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

/**
 * Both metrics for a single age bracket in a single region.
 */
export type AgeBracketData = {
  [M in MetricType]: DistributionData;
};

/**
 * All age brackets for a single region.
 * Optional keys because mock data only covers a subset of brackets.
 */
export type RegionDataset = {
  [A in AgeBracket]?: AgeBracketData;
};

/**
 * Top-level data shape: region → age bracket → metric → distribution.
 */
export type AllRegionsData = {
  [R in Region]: RegionDataset;
};
