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
