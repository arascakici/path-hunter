import type { Env } from '../src/config/env.js';
import { loadAssets } from '../src/config/assets.js';
import { isTestnet } from '../src/config/env.js';
import { createLogger } from '../src/logger/logger.js';
import { HorizonClient } from '../src/horizon/client.js';
import { Scanner, type ScanResult } from '../src/arbitrage/scanner.js';
import type { Opportunity } from '../src/arbitrage/types.js';

export interface ScanRunOptions {
  /** Run a single pass and return instead of looping. */
  once: boolean;
}

/**
 * Runs the scanner either once or on an interval, printing a readable report
 * after each pass. Handles Ctrl+C by finishing the current pass and stopping.
 */
export async function runScan(env: Env, options: ScanRunOptions): Promise<void> {
  const log = createLogger();
  const assets = loadAssets(env.ASSETS_CONFIG);
  const client = HorizonClient.fromEnv(env, log);

  log.info('PathHunter — triangular arbitrage scanner', {
    mode: 'scan',
    network: isTestnet(env) ? 'testnet' : 'custom',
    horizon: env.HORIZON_URL,
  });

  const latestLedger = await client.checkConnection();
  log.info('connected to Horizon', { latestLedger });
  log.info('configuration', {
    startAsset: assets.startAsset,
    assets: assets.assets.map((a) => a.code).join(','),
    startAmount: env.START_AMOUNT,
    threshold: `${env.PROFIT_THRESHOLD_PCT}%`,
    intervalMs: env.SCAN_INTERVAL_MS,
  });

  const scanner = Scanner.fromEnv(client, assets, env, log);

  const abort = new AbortController();
  process.on('SIGINT', () => {
    if (!abort.signal.aborted) {
      log.info('shutdown requested — finishing current pass');
      abort.abort();
    }
  });

  let pass = 0;
  for (;;) {
    pass += 1;
    try {
      const result = await scanner.scanOnce();
      reportScan(result, env, pass);
    } catch (err) {
      log.error('scan pass failed', { pass, err: err instanceof Error ? err.message : String(err) });
    }

    if (options.once || abort.signal.aborted) break;
    await sleep(env.SCAN_INTERVAL_MS, abort.signal);
    if (abort.signal.aborted) break;
  }

  log.info('scanner stopped', { passes: pass });
}

/** Prints a compact human-readable summary of a scan pass. */
function reportScan(result: ScanResult, env: Env, pass: number): void {
  const header =
    `── scan #${pass} · ${result.cyclesScanned} cycles · ` +
    `${result.cyclesSkipped} skipped · ${result.opportunities.length} opportunities ──`;
  process.stdout.write(`\n${header}\n`);

  if (result.opportunities.length === 0) {
    process.stdout.write(`   no opportunities above ${env.PROFIT_THRESHOLD_PCT.toFixed(2)}%\n`);
    return;
  }

  for (const opp of result.opportunities) {
    process.stdout.write(formatOpportunity(opp) + '\n');
  }
}

/** Formats one opportunity as a two-line block. */
export function formatOpportunity(opp: Opportunity): string {
  const { cycle, simulation } = opp;
  const [a, b, c] = cycle.assets;
  const sign = simulation.profit >= 0 ? '+' : '';
  const head =
    `★ ${cycle.id}  ${sign}${simulation.profitPct.toFixed(2)}%  ` +
    `${simulation.startAmount.toFixed(4)} → ${simulation.endAmount.toFixed(4)} ${a.code}`;

  const [l0, l1, l2] = simulation.legs;
  const legs =
    `    ${a.code}→${b.code} x${rate(l0?.effectivePrice)}   ` +
    `${b.code}→${c.code} x${rate(l1?.effectivePrice)}   ` +
    `${c.code}→${a.code} x${rate(l2?.effectivePrice)}`;

  return `${head}\n${legs}`;
}

function rate(value: number | undefined): string {
  return value === undefined ? '?' : value.toFixed(4);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
