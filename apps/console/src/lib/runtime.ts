import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot, loadEnv, type Env } from '@courier/core';
import { createRuntime, type Runtime } from '@courier/gateway';

/**
 * One Courier runtime per server process, shared by every page, action and
 * the demo MCP endpoint. Config comes from the repo-root .env (same file the
 * gateway uses), so both processes share the data dir and vault key.
 */
declare global {
  var __courierRuntime: Promise<Runtime> | undefined;
  var __courierEnv: Env | undefined;
}

function env(): Env {
  if (!globalThis.__courierEnv) {
    const file = process.env.COURIER_ENV_FILE ?? join(findRepoRoot(), '.env');
    if (existsSync(/* turbopackIgnore: true */ file)) process.loadEnvFile(file);
    globalThis.__courierEnv = loadEnv();
  }
  return globalThis.__courierEnv;
}

export function courierEnv(): Env {
  return env();
}

/** Hosted demo (no disk, no credentials): COURIER_EPHEMERAL=1. */
export function isEphemeral(): boolean {
  return process.env.COURIER_EPHEMERAL === '1';
}

export function runtime(): Promise<Runtime> {
  globalThis.__courierRuntime ??= createRuntime(env(), {
    ephemeral: isEphemeral(),
    ...(process.env.MOCK_BITREFILL_URL ? { mockUrl: process.env.MOCK_BITREFILL_URL } : {}),
    logName: 'courier-console',
  }).catch((e: unknown) => {
    globalThis.__courierRuntime = undefined;
    throw e;
  });
  return globalThis.__courierRuntime;
}
