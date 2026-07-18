import { Keypair } from '@stellar/stellar-sdk';
import { isTestnet, type Env } from '../src/config/env.js';
import { loadAssets } from '../src/config/assets.js';
import { createLogger, type Logger } from '../src/logger/logger.js';
import { HorizonClient, assetId } from '../src/horizon/client.js';
import { Scanner } from '../src/arbitrage/scanner.js';
import type { AssetConfigRef } from '../src/arbitrage/types.js';
import { executeOpportunity } from './executor.js';

export interface ExecuteRunOptions {
  /** Explicit acknowledgement flag (`--confirm`). */
  confirm: boolean;
  /** Build/sign only, never submit (`--dry-run`). */
  dryRun: boolean;
}

/**
 * Finds the best opportunity and, subject to layered guards, submits it as a
 * testnet path payment. Guards are defence-in-depth: several independent
 * conditions must all hold before a real transaction is sent.
 */
export async function runExecute(env: Env, options: ExecuteRunOptions): Promise<void> {
  const log = createLogger();
  assertExecuteAllowed(env, options);

  // Safe: presence asserted above (or dry run also requires it).
  const keypair = Keypair.fromSecret(env.EXECUTE_SECRET_KEY as string);
  const assets = loadAssets(env.ASSETS_CONFIG);
  const client = HorizonClient.fromEnv(env, log);

  log.info('PathHunter — execute mode', {
    network: 'testnet',
    account: keypair.publicKey(),
    dryRun: options.dryRun,
  });

  await client.checkConnection();
  await ensureFunded(client, keypair.publicKey(), log);

  const scanner = Scanner.fromEnv(client, assets, env, log);
  const result = await scanner.scanOnce();

  if (result.opportunities.length === 0) {
    log.info('no opportunities above threshold — nothing to execute', {
      threshold: `${env.PROFIT_THRESHOLD_PCT}%`,
    });
    return;
  }

  const top = result.opportunities[0];
  if (!top) return;
  const startAsset = top.cycle.assets[0];

  log.info('selected opportunity', {
    cycle: top.cycle.id,
    profitPct: Number(top.profitPct.toFixed(4)),
    startAmount: top.simulation.startAmount,
    projectedEnd: Number(top.simulation.endAmount.toFixed(7)),
  });

  const before = await assetBalance(client, keypair.publicKey(), startAsset);
  const exec = await executeOpportunity(client, env, keypair, top, { dryRun: options.dryRun });

  if (options.dryRun) {
    log.info('dry run — transaction built and signed but NOT submitted', {
      hash: exec.hash,
      sendAmount: exec.sendAmount,
      destMin: exec.destMin,
    });
    process.stdout.write('\nSigned transaction envelope (XDR):\n' + exec.xdr + '\n');
    return;
  }

  const after = await assetBalance(client, keypair.publicKey(), startAsset);
  log.info('transaction submitted', {
    hash: exec.hash,
    successful: exec.successful,
    ledger: exec.ledger,
  });
  log.info('balance change', {
    asset: startAsset.code,
    before: before?.toFixed(7),
    after: after?.toFixed(7),
    delta: before !== null && after !== null ? (after - before).toFixed(7) : 'unknown',
  });
}

/** Throws unless every guard for a real submission is satisfied. */
function assertExecuteAllowed(env: Env, options: ExecuteRunOptions): void {
  if (!isTestnet(env)) {
    throw new Error('refusing to execute: PathHunter only ever executes on the Stellar testnet');
  }
  if (!env.EXECUTE_SECRET_KEY) {
    throw new Error('refusing to execute: EXECUTE_SECRET_KEY is not set (needs a friendbot-funded testnet key)');
  }
  // A dry run builds/signs but never submits, so the remaining guards are only
  // enforced for real submissions.
  if (options.dryRun) return;

  if (!env.EXECUTE_ENABLED) {
    throw new Error('refusing to execute: set EXECUTE_ENABLED=true to opt in to submitting transactions');
  }
  if (!options.confirm) {
    throw new Error('refusing to execute: pass --confirm to acknowledge you are submitting a real (testnet) transaction');
  }
}

/** Ensures the account exists on-chain, funding it via Friendbot if needed. */
async function ensureFunded(client: HorizonClient, publicKey: string, log: Logger): Promise<void> {
  try {
    await client.loadAccount(publicKey);
  } catch {
    log.info('account not found on-chain — funding via friendbot', { account: publicKey });
    await client.fundWithFriendbot(publicKey);
  }
}

/** Returns the account's balance of `asset`, or null if the trustline is absent. */
async function assetBalance(
  client: HorizonClient,
  publicKey: string,
  asset: AssetConfigRef,
): Promise<number | null> {
  const account = await client.loadAccount(publicKey);
  const wanted = assetId(asset);
  for (const balance of account.balances) {
    const id =
      balance.asset_type === 'native'
        ? 'XLM'
        : 'asset_code' in balance && 'asset_issuer' in balance
          ? `${balance.asset_code}:${balance.asset_issuer}`
          : '';
    if (id === wanted) return Number(balance.balance);
  }
  return null;
}
