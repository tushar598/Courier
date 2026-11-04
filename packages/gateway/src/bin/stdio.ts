#!/usr/bin/env node
/**
 * Courier gateway over stdio, for Claude Code / Claude Desktop / Cursor.
 * Reads config from the environment, or from the file in COURIER_ENV_FILE.
 * stdout is the MCP channel; all logs go to stderr.
 */
import { existsSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnv } from '@courier/core';
import { createGatewayServer } from '../server.js';
import { createRuntime } from '../runtime.js';

const envFile = process.env.COURIER_ENV_FILE;
if (envFile && existsSync(envFile)) process.loadEnvFile(envFile);

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
