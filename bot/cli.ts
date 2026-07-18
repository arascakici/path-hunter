import { parseArgs } from 'node:util';
import { loadEnv, type Env } from '../src/config/env.js';
import { runScan } from './scan.js';

/**
 * PathHunter CLI entry point.
 *
 *   tsx bot/cli.ts scan     [--once] [--interval ms] [--threshold pct] [--amount n] [--assets path]
 *   tsx bot/cli.ts execute  (arrives in the next build step)
 */

const USAGE = `PathHunter — Stellar testnet triangular arbitrage scanner

Usage:
  bot:scan [options]        Scan for opportunities (log only)
  bot:execute [options]     Execute a found opportunity (testnet only)

Options:
  --once                    Run a single scan pass and exit
  --interval <ms>           Override scan interval
  --threshold <pct>         Override profit threshold (percent)
  --amount <n>              Override start amount
  --assets <path>           Override assets config path
  -h, --help                Show this help
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      once: { type: 'boolean', default: false },
      interval: { type: 'string' },
      threshold: { type: 'string' },
      amount: { type: 'string' },
      assets: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const mode = positionals[0];

  if (values.help || !mode) {
    process.stdout.write(USAGE);
    process.exit(mode ? 0 : values.help ? 0 : 1);
  }

  const env = applyOverrides(loadEnv(), values);

  switch (mode) {
    case 'scan':
      await runScan(env, { once: Boolean(values.once) });
      break;
    case 'execute':
      process.stderr.write(
        'execute mode is not wired up yet — it arrives in the next build step.\n',
      );
      process.exit(1);
      break;
    default:
      process.stderr.write(`Unknown command "${mode}".\n\n${USAGE}`);
      process.exit(1);
  }
}

/** Applies CLI flag overrides on top of the validated environment config. */
function applyOverrides(env: Env, values: Record<string, unknown>): Env {
  const next: Env = { ...env };
  if (typeof values.interval === 'string') next.SCAN_INTERVAL_MS = parsePositiveInt(values.interval, 'interval');
  if (typeof values.threshold === 'string') next.PROFIT_THRESHOLD_PCT = parseNonNegative(values.threshold, 'threshold');
  if (typeof values.amount === 'string') next.START_AMOUNT = parsePositive(values.amount, 'amount');
  if (typeof values.assets === 'string') next.ASSETS_CONFIG = values.assets;
  return next;
}

function parsePositiveInt(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer, got "${raw}"`);
  return n;
}

function parsePositive(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number, got "${raw}"`);
  return n;
}

function parseNonNegative(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number, got "${raw}"`);
  return n;
}

main().catch((err) => {
  process.stderr.write(`\nError: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
