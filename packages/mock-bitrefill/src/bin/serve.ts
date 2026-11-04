#!/usr/bin/env node
/** Shared mock Bitrefill MCP on http://127.0.0.1:<port>/mcp (default 4010). */
import { startMockBitrefillHttp } from '../http.js';

const port = Number(process.env.MOCK_BITREFILL_PORT ?? 4010);
await startMockBitrefillHttp(port);
console.error(
  `mock bitrefill listening on http://127.0.0.1:${port}/mcp (test double, not Bitrefill)`,
);
