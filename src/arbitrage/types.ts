/**
 * Data contracts shared by the arbitrage core. These are deliberately plain,
 * SDK-free structures so the pure math in `triangular.ts` can be unit-tested
 * with fixtures and so the Horizon client has a normalization target.
 */

/** One resting price level in an order book. */
export interface OrderBookLevel {
  /** Price of the base asset denominated in the counter asset (counter per base). */
  price: number;
  /** Amount of the base asset available at this level. */
  amount: number;
}

/**
 * A normalized order book for a `base/counter` pair.
 *
 * - `asks` are offers to sell the base asset for the counter asset (you take
 *   asks, cheapest first, when buying base with counter).
 * - `bids` are offers to buy the base asset with the counter asset (you take
 *   bids, highest first, when selling base for counter).
 */
export interface OrderBook {
  base: AssetId;
  counter: AssetId;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

/** Canonical string id for an asset: `"XLM"` for native, `"CODE:ISSUER"` otherwise. */
export type AssetId = string;

/**
 * A candidate triangular cycle A→B→C→A. `assets[0]` is the start/end asset;
 * the three legs are A→B, B→C and C→A.
 */
export interface Cycle {
  /** Human-readable id, e.g. `"XLM->USDC->SRT"`. */
  id: string;
  assets: [AssetConfigRef, AssetConfigRef, AssetConfigRef];
}

/** Minimal asset shape used inside cycles (mirrors `AssetConfig`). */
export interface AssetConfigRef {
  code: string;
  issuer: string | null;
}

/** The outcome of converting one leg's input through its order book. */
export interface LegResult {
  /** Amount of the source asset offered into the leg. */
  input: number;
  /** Amount of the target asset received. */
  output: number;
  /** Amount of the source asset actually spent (equals `input` unless exhausted). */
  consumed: number;
  /** Target received per source spent for this leg. */
  effectivePrice: number;
  /** True when the order book ran out before the full input could be spent. */
  exhausted: boolean;
}

/** The result of simulating a full A→B→C→A cycle at a fixed probe size. */
export interface CycleSimulation {
  startAmount: number;
  endAmount: number;
  /** `endAmount - startAmount` in units of the start asset. */
  profit: number;
  /** Profit as a percentage of `startAmount`. */
  profitPct: number;
  /** True only when every leg fully consumed its input (executable at this size). */
  feasible: boolean;
  legs: LegResult[];
}

/** A profitable, feasible cycle surfaced by the scanner. */
export interface Opportunity {
  cycle: Cycle;
  simulation: CycleSimulation;
  /** Convenience mirror of `simulation.profitPct`. */
  profitPct: number;
  /** ISO timestamp of when the opportunity was detected. */
  detectedAt: string;
}
