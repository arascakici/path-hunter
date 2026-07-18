import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import type { xdr } from '@stellar/stellar-sdk';
import { HorizonClient } from '../src/horizon/client.js';
import { createLogger, type Logger } from '../src/logger/logger.js';

/**
 * Seeds the Stellar testnet with a reproducible triangular-arbitrage setup so
 * the scanner, CLI and web panel show a *real* opportunity.
 *
 * It creates an issuer + a market-maker, issues two assets (USDC, SRT), and
 * places three offers whose prices are deliberately inconsistent:
 *
 *   leg XLM→USDC : 2   XLM per USDC   (p1)
 *   leg USDC→SRT : 0.5 USDC per SRT   (p2)
 *   leg SRT→XLM  : 0.9 SRT  per XLM   (p3)
 *
 * Round-trip multiplier = 1 / (p1·p2·p3) = 1 / 0.9 ≈ +11.1%.
 *
 * Finally it writes config/assets.json pointing at the new issuer, so
 * `npm run bot:scan` and the panel pick it up immediately.
 */

const HORIZON = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const PASSPHRASE = Networks.TESTNET;
const OUT_PATH = process.env.ASSETS_CONFIG ?? './config/assets.json';

async function main(): Promise<void> {
  const log = createLogger();
  const client = new HorizonClient({ horizonUrl: HORIZON, networkPassphrase: PASSPHRASE, logger: log });
  await client.checkConnection();

  const issuer = Keypair.random();
  const marketMaker = Keypair.random();
  log.info('creating testnet accounts', {
    issuer: issuer.publicKey(),
    marketMaker: marketMaker.publicKey(),
  });
  await client.fundWithFriendbot(issuer.publicKey());
  await client.fundWithFriendbot(marketMaker.publicKey());

  const usdc = new Asset('USDC', issuer.publicKey());
  const srt = new Asset('SRT', issuer.publicKey());
  const xlm = Asset.native();

  await submit(client, marketMaker, log, 'market-maker trustlines', [
    Operation.changeTrust({ asset: usdc, limit: '1000000' }),
    Operation.changeTrust({ asset: srt, limit: '1000000' }),
  ]);

  await submit(client, issuer, log, 'issue USDC + SRT to market-maker', [
    Operation.payment({ destination: marketMaker.publicKey(), asset: usdc, amount: '100000' }),
    Operation.payment({ destination: marketMaker.publicKey(), asset: srt, amount: '100000' }),
  ]);

  await submit(client, marketMaker, log, 'place cyclic offers', [
    // sell USDC for XLM at 2 XLM/USDC  → ask in XLM→USDC book
    Operation.manageSellOffer({ selling: usdc, buying: xlm, amount: '1000', price: '2' }),
    // sell SRT for USDC at 0.5 USDC/SRT → ask in USDC→SRT book
    Operation.manageSellOffer({ selling: srt, buying: usdc, amount: '2000', price: '0.5' }),
    // sell XLM for SRT at 0.9 SRT/XLM  → ask in SRT→XLM book (the mispriced leg)
    Operation.manageSellOffer({ selling: xlm, buying: srt, amount: '2000', price: '0.9' }),
  ]);

  const config = {
    startAsset: 'XLM',
    assets: [
      { code: 'XLM', issuer: null },
      { code: 'USDC', issuer: issuer.publicKey() },
      { code: 'SRT', issuer: issuer.publicKey() },
    ],
  };
  writeFileSync(resolve(OUT_PATH), JSON.stringify(config, null, 2) + '\n', 'utf8');
  log.info('wrote assets config', { path: OUT_PATH });

  log.info('SEED COMPLETE — a profitable XLM→USDC→SRT cycle (~+11%) should now appear');
  log.info('run `npm run bot:scan -- --once` or open the panel to see it');
  log.info('save these secrets to reuse or to run execute mode', {
    issuerSecret: issuer.secret(),
    marketMakerSecret: marketMaker.secret(),
  });
}

/** Loads the source account, builds a signed tx from `ops`, and submits it. */
async function submit(
  client: HorizonClient,
  source: Keypair,
  log: Logger,
  label: string,
  ops: xdr.Operation[],
): Promise<void> {
  const account = await client.loadAccount(source.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  });
  for (const op of ops) builder.addOperation(op);
  const tx = builder.setTimeout(120).build();
  tx.sign(source);
  const res = await client.submitTransaction(tx);
  log.info(`${label} — submitted`, { hash: res.hash });
}

main().catch((err) => {
  process.stderr.write(`\nSeed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
