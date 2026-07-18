import { isTestnet, loadEnv } from '../config/env.js';
import { resolveAssets } from '../config/assets.js';
import { HorizonClient } from '../horizon/client.js';
import { Scanner } from '../arbitrage/scanner.js';
import type { CycleScan } from '../arbitrage/scanner.js';
import type { Opportunity } from '../arbitrage/types.js';

/**
 * Framework-agnostic scan handler. Runs a single stateless scan and returns a
 * JSON-serializable payload. Shared by the Vercel serverless function and the
 * local dev server, so both surfaces behave identically.
 */

export interface ApiScanResponse {
  scannedAt: string;
  network: 'testnet' | 'custom';
  config: {
    startAsset: string;
    startAmount: number;
    thresholdPct: number;
    assets: string[];
  };
  cyclesScanned: number;
  cyclesSkipped: number;
  opportunities: Opportunity[];
  results: CycleScan[];
}

export async function runScanApi(): Promise<ApiScanResponse> {
  const env = loadEnv();
  const assets = resolveAssets(env);
  const client = HorizonClient.fromEnv(env);
  const scanner = Scanner.fromEnv(client, assets, env);

  const result = await scanner.scanOnce();

  return {
    scannedAt: result.scannedAt,
    network: isTestnet(env) ? 'testnet' : 'custom',
    config: {
      startAsset: assets.startAsset,
      startAmount: env.START_AMOUNT,
      thresholdPct: env.PROFIT_THRESHOLD_PCT,
      assets: assets.assets.map((a) => a.code),
    },
    cyclesScanned: result.cyclesScanned,
    cyclesSkipped: result.cyclesSkipped,
    opportunities: result.opportunities,
    results: result.results,
  };
}
