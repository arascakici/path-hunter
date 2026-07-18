// Public surface of the PathHunter core. Both the CLI bot (bot/) and the Vercel
// serverless function (api/) import from here.

export { loadEnv, isTestnet, type Env } from './config/env.js';
export {
  loadAssets,
  type AssetConfig,
  type AssetsConfig,
} from './config/assets.js';
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
