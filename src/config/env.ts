import { config as loadDotenv } from 'dotenv';
import { Networks } from '@stellar/stellar-sdk';
import { z } from 'zod';

/**
 * Parses and validates runtime configuration from environment variables.
 *
 * PathHunter is testnet-only, so this module actively refuses configurations
 * that look like mainnet (the PUBLIC network passphrase or the mainnet Horizon
 * host). That guard is intentional: it is the first line of defence against
 * accidentally pointing the bot at real money.
 */

const envBool = z
  .string()
  .default('false')
  .transform((v) => /^(true|1|yes|on)$/i.test(v.trim()));

const envSchema = z
  .object({
    HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
    NETWORK_PASSPHRASE: z.string().min(1).default(Networks.TESTNET),
    SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
    PROFIT_THRESHOLD_PCT: z.coerce.number().min(0).default(0.5),
    START_AMOUNT: z.coerce.number().positive().default(100),
    ASSETS_CONFIG: z.string().min(1).default('./config/assets.json'),
    // Inline asset list as a JSON string. Preferred in serverless environments
    // (e.g. Vercel) where reading a local config file is awkward.
    ASSETS_JSON: z.string().optional(),
    EXECUTE_ENABLED: envBool,
    EXECUTE_SECRET_KEY: z
      .string()
      .regex(/^S[A-Z2-7]{55}$/, 'must be a valid Stellar secret key (S...)')
      .optional(),
  })
  .refine((e) => e.NETWORK_PASSPHRASE !== Networks.PUBLIC, {
    message:
      'NETWORK_PASSPHRASE is the Stellar PUBLIC (mainnet) network. PathHunter is testnet-only; refusing to run.',
    path: ['NETWORK_PASSPHRASE'],
  })
  .refine((e) => !e.HORIZON_URL.includes('horizon.stellar.org'), {
    message:
      'HORIZON_URL points at mainnet Horizon (horizon.stellar.org). Use https://horizon-testnet.stellar.org.',
    path: ['HORIZON_URL'],
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Loads `.env` (if present) and validates the resulting environment.
 * The result is cached; pass `reload: true` to re-read (useful in tests).
 */
export function loadEnv(reload = false): Env {
  if (cached && !reload) return cached;

  loadDotenv();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** True when the configured network is the Stellar testnet. */
export function isTestnet(env: Env): boolean {
  return env.NETWORK_PASSPHRASE === Networks.TESTNET;
}
