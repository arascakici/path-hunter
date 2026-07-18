import type { AssetsConfig } from '../config/assets.js';
import type { Env } from '../config/env.js';
import type { Logger } from '../logger/logger.js';
import { HorizonClient, assetId, toSdkAsset } from '../horizon/client.js';
import { buildTriangularCycles, isProfitable, simulateCycle } from './triangular.js';
import type {
  AssetConfigRef,
  Cycle,
  CycleSimulation,
  OrderBook,
  Opportunity,
} from './types.js';

/**
 * Orchestrates a scan: enumerate triangular cycles, fetch the order books they
 * need from Horizon (deduplicated and concurrency-limited), run the pure
 * simulation on each, and return every result plus the ranked opportunities.
 *
 * All Horizon I/O lives here; the math stays pure in `triangular.ts`.
 */

export interface ScannerOptions {
  startAmount: number;
  thresholdPct: number;
  feePerLegPct?: number;
  orderBookLimit?: number;
  /** Max concurrent order-book requests. Defaults to 8. */
  concurrency?: number;
  logger?: Logger;
  /** Injectable clock for deterministic timestamps. Defaults to `Date`. */
  now?: () => Date;
}

/** One cycle's simulated outcome (feasible or not). */
export interface CycleScan {
  cycle: Cycle;
  simulation: CycleSimulation;
}

export interface ScanResult {
  scannedAt: string;
  cyclesScanned: number;
  /** Cycles skipped because an order book could not be fetched. */
  cyclesSkipped: number;
  /** Every simulated cycle, unranked. */
  results: CycleScan[];
  /** Feasible cycles clearing the threshold, ranked by profit descending. */
  opportunities: Opportunity[];
}

export class Scanner {
  private readonly log: Logger | undefined;
  private readonly orderBookLimit: number;
  private readonly concurrency: number;
  private readonly now: () => Date;

  constructor(
    private readonly client: HorizonClient,
    private readonly assets: AssetsConfig,
    private readonly options: ScannerOptions,
  ) {
    this.log = options.logger;
    this.orderBookLimit = options.orderBookLimit ?? 20;
    this.concurrency = Math.max(1, options.concurrency ?? 8);
    this.now = options.now ?? (() => new Date());
  }

  static fromEnv(
    client: HorizonClient,
    assets: AssetsConfig,
    env: Env,
    logger?: Logger,
  ): Scanner {
    return new Scanner(client, assets, {
      startAmount: env.START_AMOUNT,
      thresholdPct: env.PROFIT_THRESHOLD_PCT,
      logger,
    });
  }

  /** Runs a single scan pass over all triangular cycles. */
  async scanOnce(): Promise<ScanResult> {
    const cycles = buildTriangularCycles(this.assets.assets, this.assets.startAsset);
    const books = await this.fetchBooks(cycles);

    const results: CycleScan[] = [];
    const opportunities: Opportunity[] = [];
    let skipped = 0;

    for (const cycle of cycles) {
      const cycleBooks = this.booksForCycle(cycle, books);
      if (!cycleBooks) {
        skipped += 1;
        this.log?.debug('skipping cycle (missing order book)', { cycle: cycle.id });
        continue;
      }

      const simulation = simulateCycle(this.options.startAmount, cycleBooks, {
        feePerLegPct: this.options.feePerLegPct,
      });
      results.push({ cycle, simulation });

      this.log?.debug('scanned cycle', {
        cycle: cycle.id,
        profitPct: Number(simulation.profitPct.toFixed(4)),
        feasible: simulation.feasible,
      });

      if (isProfitable(simulation, this.options.thresholdPct)) {
        opportunities.push({
          cycle,
          simulation,
          profitPct: simulation.profitPct,
          detectedAt: this.now().toISOString(),
        });
      }
    }

    opportunities.sort((a, b) => b.profitPct - a.profitPct);

    return {
      scannedAt: this.now().toISOString(),
      cyclesScanned: cycles.length,
      cyclesSkipped: skipped,
      results,
      opportunities,
    };
  }

  /** Fetches every distinct order book the cycles need, keyed by orientation. */
  private async fetchBooks(cycles: Cycle[]): Promise<Map<string, OrderBook>> {
    const needed = new Map<string, { source: AssetConfigRef; target: AssetConfigRef }>();
    for (const cycle of cycles) {
      for (const leg of legPairs(cycle)) {
        needed.set(bookKey(leg.source, leg.target), leg);
      }
    }

    const books = new Map<string, OrderBook>();
    await runWithConcurrency([...needed.entries()], this.concurrency, async ([key, leg]) => {
      try {
        const book = await this.client.getOrderBook(
          toSdkAsset(leg.target),
          toSdkAsset(leg.source),
          this.orderBookLimit,
        );
        books.set(key, book);
      } catch (err) {
        this.log?.warn('order book fetch failed', { pair: key, err: errorText(err) });
      }
    });

    return books;
  }

  /** Assembles a cycle's three leg books in order, or null if any are missing. */
  private booksForCycle(
    cycle: Cycle,
    books: Map<string, OrderBook>,
  ): [OrderBook, OrderBook, OrderBook] | null {
    const legs = legPairs(cycle);
    const resolved = legs.map((leg) => books.get(bookKey(leg.source, leg.target)));
    if (resolved.some((b) => b === undefined)) return null;
    return resolved as [OrderBook, OrderBook, OrderBook];
  }
}

/** The three legs of a cycle as `{ source, target }` pairs. */
function legPairs(cycle: Cycle): Array<{ source: AssetConfigRef; target: AssetConfigRef }> {
  const [a, b, c] = cycle.assets;
  return [
    { source: a, target: b },
    { source: b, target: c },
    { source: c, target: a },
  ];
}

/** Cache key for a leg's order book (base = target, counter = source). */
function bookKey(source: AssetConfigRef, target: AssetConfigRef): string {
  return `${assetId(target)}|${assetId(source)}`;
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      if (current !== undefined) await worker(current);
    }
  });
  await Promise.all(runners);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
