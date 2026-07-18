import type {
  AssetConfigRef,
  Cycle,
  CycleSimulation,
  LegResult,
  OrderBook,
  OrderBookLevel,
} from './types.js';

/**
 * Pure, deterministic triangular-arbitrage math. Everything here is a function
 * of its inputs (order books in → profit out) with no I/O, which is exactly
 * what the unit tests exercise.
 *
 * Leg convention: to convert a `source` asset into a `target` asset, the caller
 * supplies the order book whose `asks` are offers *selling the target for the
 * source* — i.e. `base = target`, `counter = source`, so each ask's `price` is
 * "source per target" and its `amount` is target available. We consume asks
 * cheapest-first, which naturally models slippage across depth.
 */

/** One stroop — Stellar's smallest unit. Amounts below this are treated as zero. */
const EPSILON = 1e-7;

export interface SimulationOptions {
  /**
   * Optional haircut applied to each leg's output, as a percentage, to model
   * fees/safety margin. Defaults to 0 (Stellar's DEX charges no taker fee).
   */
  feePerLegPct?: number;
}

/** The result of spending `spend` of the source asset against a list of asks. */
interface FillResult {
  bought: number;
  spent: number;
  exhausted: boolean;
}

/**
 * Spends up to `spend` units of the source asset buying the target asset,
 * consuming `asks` cheapest-first. Invalid or non-positive levels are skipped.
 */
export function fillBuy(spend: number, asks: OrderBookLevel[]): FillResult {
  let remaining = spend;
  let bought = 0;
  let spent = 0;

  for (const level of asks) {
    if (remaining <= EPSILON) break;
    if (!(level.price > 0) || !(level.amount > 0)) continue;

    const levelCost = level.amount * level.price; // source needed to take the whole level
    if (remaining >= levelCost) {
      bought += level.amount;
      spent += levelCost;
      remaining -= levelCost;
    } else {
      bought += remaining / level.price;
      spent += remaining;
      remaining = 0;
      break;
    }
  }

  return { bought, spent, exhausted: remaining > EPSILON };
}

/**
 * Simulates a full A→B→C→A cycle at a fixed probe size. `books` must be in leg
 * order (A→B, B→C, C→A), each oriented as described in the module comment.
 */
export function simulateCycle(
  startAmount: number,
  books: [OrderBook, OrderBook, OrderBook],
  options: SimulationOptions = {},
): CycleSimulation {
  if (!(startAmount > 0)) {
    throw new Error(`startAmount must be positive, received ${startAmount}`);
  }
  const feeMultiplier = 1 - clampFeePct(options.feePerLegPct) / 100;

  const legs: LegResult[] = [];
  let amount = startAmount;
  let feasible = true;

  for (const book of books) {
    const input = amount;
    const { bought, spent, exhausted } = fillBuy(input, book.asks);
    const output = bought * feeMultiplier;

    legs.push({
      input,
      output,
      consumed: spent,
      effectivePrice: input > 0 ? output / input : 0,
      exhausted,
    });

    if (exhausted) feasible = false;
    amount = output;
  }

  const endAmount = amount;
  const profit = endAmount - startAmount;

  return {
    startAmount,
    endAmount,
    profit,
    profitPct: (profit / startAmount) * 100,
    feasible,
    legs,
  };
}

/** True when a simulation is executable and clears the profit threshold. */
export function isProfitable(simulation: CycleSimulation, thresholdPct: number): boolean {
  return simulation.feasible && simulation.profitPct >= thresholdPct;
}

/**
 * Enumerates every ordered triangular cycle start→X→Y→start from an asset list.
 * Both directions (start→X→Y and start→Y→X) are produced since they use
 * different order books and may have opposite profitability.
 */
export function buildTriangularCycles(assets: AssetConfigRef[], startCode: string): Cycle[] {
  const start = assets.find((a) => a.code === startCode);
  if (!start) {
    throw new Error(`start asset "${startCode}" is not in the provided asset list`);
  }

  const others = assets.filter((a) => a.code !== startCode);
  const cycles: Cycle[] = [];

  for (const b of others) {
    for (const c of others) {
      if (b.code === c.code) continue;
      cycles.push({ id: `${start.code}->${b.code}->${c.code}`, assets: [start, b, c] });
    }
  }

  return cycles;
}

function clampFeePct(feePct: number | undefined): number {
  if (feePct === undefined) return 0;
  if (!Number.isFinite(feePct) || feePct < 0) return 0;
  return Math.min(feePct, 100);
}
