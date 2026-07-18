/*
 * Client-side mirror of the `/api/scan` response contract
 * (source of truth: src/api/scan-handler.ts). Kept self-contained so the
 * browser bundle never imports server code (Stellar SDK, fs, etc.).
 */

export interface AssetRef {
  code: string;
  issuer: string | null;
}

export interface Cycle {
  id: string;
  assets: [AssetRef, AssetRef, AssetRef];
}

export interface LegResult {
  input: number;
  output: number;
  consumed: number;
  effectivePrice: number;
  exhausted: boolean;
}

export interface CycleSimulation {
  startAmount: number;
  endAmount: number;
  profit: number;
  profitPct: number;
  feasible: boolean;
  legs: LegResult[];
}

export interface Opportunity {
  cycle: Cycle;
  simulation: CycleSimulation;
  profitPct: number;
  detectedAt: string;
}

export interface CycleResult {
  cycle: Cycle;
  simulation: CycleSimulation;
}

export interface ScanResponse {
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
  results: CycleResult[];
}
