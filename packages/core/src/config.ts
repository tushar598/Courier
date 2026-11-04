import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { VaultKey } from './crypto.js';
import { PolicyConfigSchema, type PolicyConfig } from './policy.js';

export const EnvSchema = z.object({
  COURIER_MODE: z.enum(['demo', 'live']).default('demo'),
  BITREFILL_API_KEY: z.string().optional(),
  BITREFILL_MCP_URL: z.url().default('https://api.bitrefill.com/mcp'),
  COURIER_VAULT_KEY: z.string().optional(),
  COURIER_HANDLE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 86_400),
  COURIER_DATA_DIR: z.string().default('./data'),
  COURIER_POLICY_FILE: z.string().optional(),
  COURIER_PAYMENT_METHOD: z.string().default('balance'),
  COURIER_BALANCE_CURRENCY: z.enum(['USD', 'EUR', 'BTC']).default('USD'),
  COURIER_POLL_INTERVAL_MS: z.coerce.number().int().nonnegative().default(10_000),
});
export type Env = z.infer<typeof EnvSchema>;

/**
 * Defaults match the hackathon budget: $10 per order and per day, a human
 * approves anything above $2. Override with COURIER_POLICY_FILE (JSON).
 */
export const DEFAULT_POLICY: PolicyConfig = PolicyConfigSchema.parse({
  allowedProductTypes: ['giftcards', 'esims'],
  allowedCountries: ['IN', 'KN', 'US', 'GB', 'AE', 'SG', 'TH'],
  perOrderCapCents: 1_000,
  dailyCapCents: 1_000,
  approvalThresholdCents: 200,
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = EnvSchema.parse(source);
  if (env.COURIER_MODE === 'live' && !env.BITREFILL_API_KEY) {
    throw new Error('COURIER_MODE=live requires BITREFILL_API_KEY');
  }
  return env;
}

export function loadPolicy(env: Env): PolicyConfig {
  if (!env.COURIER_POLICY_FILE) return DEFAULT_POLICY;
  return PolicyConfigSchema.parse(JSON.parse(readFileSync(env.COURIER_POLICY_FILE, 'utf8')));
}

/** Nearest ancestor containing pnpm-workspace.yaml, so every process agrees on paths. */
export function findRepoRoot(from: string = process.cwd()): string {
  let dir = resolve(/* turbopackIgnore: true */ from);
  for (;;) {
    if (existsSync(join(/* turbopackIgnore: true */ dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) return resolve(/* turbopackIgnore: true */ from);
    dir = up;
  }
}

/** Relative COURIER_DATA_DIR resolves against the repo root (gateway and console share it). */
export function dataDir(env: Env): string {
  const dir = isAbsolute(env.COURIER_DATA_DIR)
    ? env.COURIER_DATA_DIR
    : join(/* turbopackIgnore: true */ findRepoRoot(), env.COURIER_DATA_DIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Vault key: COURIER_VAULT_KEY if set, otherwise a random key persisted at
 * <data dir>/vault.key (0600) so the gateway and console share it.
 */
export function loadVaultKey(env: Env): VaultKey {
  if (env.COURIER_VAULT_KEY) return VaultKey.fromBase64(env.COURIER_VAULT_KEY);
  const file = join(dataDir(env), 'vault.key');
  if (!existsSync(file)) {
    writeFileSync(file, VaultKey.generateBase64(), { mode: 0o600, flag: 'wx' });
  }
  chmodSync(file, 0o600);
  return VaultKey.fromBase64(readFileSync(file, 'utf8').trim());
}
