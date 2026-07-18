import { Asset, Horizon } from '@stellar/stellar-sdk';
import type { Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import type { AssetConfig } from '../config/assets.js';
import type { Env } from '../config/env.js';
import type { Logger } from '../logger/logger.js';
import type { AssetId, OrderBook } from '../arbitrage/types.js';

/**
 * Thin, testnet-focused wrapper around Horizon. It normalizes SDK responses
 * into the plain shapes the arbitrage core consumes and centralises error
 * wrapping and Friendbot funding. All network I/O for PathHunter goes through
 * here.
 */

export interface HorizonClientOptions {
  horizonUrl: string;
  networkPassphrase: string;
  logger?: Logger;
}

export class HorizonClient {
  readonly server: Horizon.Server;
  readonly networkPassphrase: string;
  private readonly log: Logger | undefined;

  constructor(options: HorizonClientOptions) {
    this.server = new Horizon.Server(options.horizonUrl);
    this.networkPassphrase = options.networkPassphrase;
    this.log = options.logger;
  }

  static fromEnv(env: Env, logger?: Logger): HorizonClient {
    return new HorizonClient({
      horizonUrl: env.HORIZON_URL,
      networkPassphrase: env.NETWORK_PASSPHRASE,
      logger,
    });
  }

  /** Verifies connectivity by fetching the latest ledger sequence. */
  async checkConnection(): Promise<number> {
    try {
      const page = await this.server.ledgers().order('desc').limit(1).call();
      const latest = page.records[0];
      if (!latest) throw new Error('Horizon returned no ledgers');
      return latest.sequence;
    } catch (err) {
      throw new Error(`Could not reach Horizon at ${this.server.serverURL.toString()}: ${message(err)}`);
    }
  }

  /**
   * Fetches and normalizes the order book for a `base/counter` pair.
   * `asks` are returned cheapest-first, `bids` highest-first (Horizon's order).
   */
  async getOrderBook(base: Asset, counter: Asset, limit = 20): Promise<OrderBook> {
    try {
      const record = await this.server.orderbook(base, counter).limit(limit).call();
      return {
        base: assetIdFromSdk(base),
        counter: assetIdFromSdk(counter),
        bids: record.bids.map((b) => ({ price: Number(b.price), amount: Number(b.amount) })),
        asks: record.asks.map((a) => ({ price: Number(a.price), amount: Number(a.amount) })),
      };
    } catch (err) {
      throw new Error(
        `Failed to load order book ${assetIdFromSdk(base)}/${assetIdFromSdk(counter)}: ${message(err)}`,
      );
    }
  }

  /**
   * Asks Horizon's path-finder how much of a destination asset you could
   * receive for `sourceAmount` of `source`. Passing the same asset as both
   * source and a destination surfaces round-trip (arbitrage) paths directly.
   */
  async strictSendPaths(
    source: Asset,
    sourceAmount: string,
    destinations: Asset[],
  ): Promise<Horizon.ServerApi.PaymentPathRecord[]> {
    try {
      const page = await this.server.strictSendPaths(source, sourceAmount, destinations).call();
      return page.records;
    } catch (err) {
      throw new Error(`strictSendPaths from ${assetIdFromSdk(source)} failed: ${message(err)}`);
    }
  }

  /**
   * Funds `publicKey` via Friendbot (testnet only). Treats an already-funded
   * account as success rather than an error.
   */
  async fundWithFriendbot(publicKey: string): Promise<void> {
    try {
      await this.server.friendbot(publicKey).call();
      this.log?.info('funded account via friendbot', { account: publicKey });
    } catch (err) {
      if (isAlreadyFunded(err)) {
        this.log?.debug('account already funded', { account: publicKey });
        return;
      }
      throw new Error(`Friendbot funding failed for ${publicKey}: ${message(err)}`);
    }
  }

  /** Loads a full account record (balances, sequence) for transaction building. */
  loadAccount(publicKey: string): Promise<Horizon.AccountResponse> {
    return this.server.loadAccount(publicKey);
  }

  /** Submits a signed transaction, surfacing Stellar `result_codes` on failure. */
  async submitTransaction(
    tx: Transaction | FeeBumpTransaction,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    try {
      return await this.server.submitTransaction(tx);
    } catch (err) {
      throw new Error(`transaction submission failed: ${message(err)}`);
    }
  }
}

/** Converts an `AssetConfig` into an SDK `Asset` (native when `issuer` is null). */
export function toSdkAsset(asset: AssetConfig): Asset {
  return asset.issuer === null ? Asset.native() : new Asset(asset.code, asset.issuer);
}

/** Canonical id for an `AssetConfig`: `"XLM"` for native, else `"CODE:ISSUER"`. */
export function assetId(asset: AssetConfig): AssetId {
  return asset.issuer === null ? 'XLM' : `${asset.code}:${asset.issuer}`;
}

/** Canonical id for an SDK `Asset`. */
export function assetIdFromSdk(asset: Asset): AssetId {
  return asset.isNative() ? 'XLM' : `${asset.getCode()}:${asset.getIssuer()}`;
}

function isAlreadyFunded(err: unknown): boolean {
  const text = message(err).toLowerCase();
  return (
    text.includes('op_already_exists') ||
    text.includes('createaccountalreadyexist') ||
    text.includes('already funded') ||
    text.includes('account already exists')
  );
}

/**
 * Builds a useful message from an error. Horizon SDK errors carry their real
 * detail (Stellar `result_codes`) in `response.data.extras`, so we surface that
 * rather than the opaque top-level "Bad Request".
 */
function message(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; response?: { data?: unknown }; data?: unknown };
    const base = typeof e.message === 'string' ? e.message : '';
    // Horizon puts problem detail on `response.data` (axios) for most endpoints,
    // but the friendbot builder attaches it directly to `response`.
    const detail =
      extractHorizonDetail(e.response?.data) ??
      extractHorizonDetail(e.response) ??
      extractHorizonDetail(e.data);
    if (detail) return base ? `${base} (${detail})` : detail;
    if (base) return base;
  }
  return String(err);
}

function extractHorizonDetail(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { extras?: { result_codes?: unknown }; detail?: unknown };
  if (d.extras?.result_codes) return JSON.stringify(d.extras.result_codes);
  if (typeof d.detail === 'string') return d.detail;
  return null;
}
