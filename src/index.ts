// Public surface of the PathHunter core. Both the CLI bot (bot/) and the Vercel
// serverless function (api/) import from here.

export { loadEnv, isTestnet, type Env } from './config/env.js';
export {
  loadAssets,
  parseAssets,
  resolveAssets,
  type AssetConfig,
  type AssetsConfig,
} from './config/assets.js';
export { runScanApi, type ApiScanResponse } from './api/scan-handler.js';
export {
  createLogger,
  logger,
  type Logger,
  type LogLevel,
  type LogFormat,
  type LogContext,
  type LoggerOptions,
} from './logger/logger.js';
export {
  HorizonClient,
  toSdkAsset,
  assetId,
  assetIdFromSdk,
  type HorizonClientOptions,
} from './horizon/client.js';
export type {
  OrderBook,
  OrderBookLevel,
  AssetId,
  Cycle,
  AssetConfigRef,
  LegResult,
  CycleSimulation,
  Opportunity,
} from './arbitrage/types.js';
export {
  fillBuy,
  simulateCycle,
  isProfitable,
  buildTriangularCycles,
  type SimulationOptions,
} from './arbitrage/triangular.js';
export {
  Scanner,
  type ScannerOptions,
  type ScanResult,
  type CycleScan,
} from './arbitrage/scanner.js';
