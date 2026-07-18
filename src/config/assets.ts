import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Loads and validates the asset list that defines the search space for
 * triangular cycles. Kept separate from `.env` because it is structured data
 * (a JSON file) that changes independently of runtime settings.
 */

const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

/** A single tradable asset. Native XLM is represented with `issuer: null`. */
export interface AssetConfig {
  code: string;
  issuer: string | null;
}

const assetConfigSchema = z
  .object({
    code: z.string().min(1).max(12),
    issuer: z
      .string()
      .regex(STELLAR_PUBLIC_KEY, 'issuer must be a valid Stellar public key (G...)')
      .nullish(),
  })
  .transform((a): AssetConfig => ({ code: a.code, issuer: a.issuer ?? null }));

const assetsConfigSchema = z
  .object({
    startAsset: z.string().min(1),
    assets: z
      .array(assetConfigSchema)
      .min(3, 'need at least 3 assets to form a triangular cycle'),
  })
  .superRefine((cfg, ctx) => {
    const codes = cfg.assets.map((a) => a.code);

    if (!codes.includes(cfg.startAsset)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `startAsset "${cfg.startAsset}" is not present in the assets list`,
        path: ['startAsset'],
      });
    }

    const duplicates = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))];
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate asset codes are not allowed: ${duplicates.join(', ')}`,
        path: ['assets'],
      });
    }

    cfg.assets.forEach((a, i) => {
      if (a.code === 'XLM' && a.issuer !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'the native asset XLM must not have an issuer',
          path: ['assets', i, 'issuer'],
        });
      }
      if (a.code !== 'XLM' && a.issuer === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `issued asset "${a.code}" requires an issuer`,
          path: ['assets', i, 'issuer'],
        });
      }
    });
  });

export type AssetsConfig = z.infer<typeof assetsConfigSchema>;

/** Reads, parses and validates the asset list at `path`. */
export function loadAssets(path: string): AssetsConfig {
  let raw: string;
  try {
    raw = readFileSync(resolve(path), 'utf8');
  } catch (err) {
    throw new Error(
      `Could not read assets config at "${path}": ${errorText(err)}. ` +
        'Copy config/assets.example.json and point ASSETS_CONFIG at it to get started.',
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Assets config at "${path}" is not valid JSON: ${errorText(err)}`);
  }

  const parsed = assetsConfigSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid assets config at "${path}":\n${issues}`);
  }

  return parsed.data;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
