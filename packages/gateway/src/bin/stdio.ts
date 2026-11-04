#!/usr/bin/env node
/**
 * Courier gateway over stdio, for Claude Code / Claude Desktop / Cursor.
 * Reads config from the environment and COURIER_ENV_FILE (default: <repo root>/.env).
 * stdout is the MCP channel; all logs go to stderr.
 */
import { existsSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join } from 'node:path';
import { findRepoRoot, loadEnv } from '@courier/core';
import { createGatewayServer } from '../server.js';
import { createRuntime } from '../runtime.js';

// Same config file as the console: COURIER_ENV_FILE, else <repo root>/.env.
// Values already set in the environment win (loadEnvFile does not override).
const envFile = process.env.COURIER_ENV_FILE ?? join(findRepoRoot(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = loadEnv();
const runtime = await createRuntime(env, {
  ...(process.env.MOCK_BITREFILL_URL ? { mockUrl: process.env.MOCK_BITREFILL_URL } : {}),
  logName: 'courier-gateway',
});
const server = createGatewayServer(runtime.agent);
await server.connect(new StdioServerTransport());

const shutdown = async () => {
  await server.close();
  await runtime.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
