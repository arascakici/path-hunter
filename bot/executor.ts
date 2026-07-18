import { BASE_FEE, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Env } from '../src/config/env.js';
import { HorizonClient, toSdkAsset } from '../src/horizon/client.js';
import type { Opportunity } from '../src/arbitrage/types.js';

/**
 * Turns an opportunity into a single `PathPaymentStrictSend` operation that
 * sends the start asset and receives it back along the cycle's path
 * (A → B → C → A, destination = self).
 *
 * The key safety property: `destMin` is set to the amount originally sent, so
 * the transaction is atomic and can only *lose* the tiny network fee — if the
 * opportunity has evaporated by submission time the operation fails cleanly
 * (`op_under_dest_min`) rather than trading at a loss.
 */

export interface ExecuteOptions {
  /** Build and sign but do not submit. */
  dryRun: boolean;
}

export interface ExecuteResult {
  hash: string;
  successful: boolean;
  ledger?: number;
  sendAmount: string;
  destMin: string;
  /** Base64 transaction envelope, included on dry runs. */
  xdr?: string;
}

export async function executeOpportunity(
  client: HorizonClient,
  env: Env,
  keypair: Keypair,
  opportunity: Opportunity,
  options: ExecuteOptions,
): Promise<ExecuteResult> {
  const [a, b, c] = opportunity.cycle.assets;
  const sendAsset = toSdkAsset(a);
  const destAsset = toSdkAsset(a);
  const path = [toSdkAsset(b), toSdkAsset(c)];

  const sendAmount = formatAmount(opportunity.simulation.startAmount);
  // Break-even floor: never receive less of the start asset than we sent.
  const destMin = formatAmount(opportunity.simulation.startAmount);

  const account = await client.loadAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: env.NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset,
        sendAmount,
        destination: keypair.publicKey(),
        destAsset,
        destMin,
        path,
      }),
    )
    .setTimeout(120)
    .build();

  tx.sign(keypair);

  if (options.dryRun) {
    return {
      hash: tx.hash().toString('hex'),
      successful: false,
      sendAmount,
      destMin,
      xdr: tx.toXDR(),
    };
  }

  const response = await client.submitTransaction(tx);
  return {
    hash: response.hash,
    successful: response.successful,
    ledger: response.ledger,
    sendAmount,
    destMin,
  };
}

/** Formats a number as a Stellar amount string (7 decimal places max). */
export function formatAmount(value: number): string {
  return value.toFixed(7);
}
