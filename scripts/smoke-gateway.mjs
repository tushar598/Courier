#!/usr/bin/env node
// Smoke test: launch the built gateway over stdio (demo mode) exactly as an MCP
// client would, run search → details → propose → status, print what the model sees.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['packages/gateway/dist/bin/stdio.js'],
  env: {
    ...process.env,
    COURIER_MODE: 'demo',
    COURIER_DATA_DIR: process.argv[2] ?? './data',
    COURIER_POLL_INTERVAL_MS: '0',
    LOG_LEVEL: 'warn',
  },
  stderr: 'inherit',
});
const client = new Client({ name: 'smoke', version: '0' });
await client.connect(transport);
const show = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.map((c) => c.text).join('');
  console.log(`\n> ${name} ${JSON.stringify(args)}\n${text.slice(0, 600)}`);
  return JSON.parse(text);
};
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
await show('search_products', { intent: 'test', query: '*', country: 'KN' });
await show('get_product_details', { product_id: 'test-esim-data-syldavia' });
const p = await show('propose_order', {
  product_id: 'test-esim-data-syldavia',
  package_value: '1GB, 7 Days',
  intent: 'smoke test',
});
await show('get_order_status', { order: p.order });
const q = await show('propose_order', {
  product_id: 'delos-syldavia',
  package_value: '1',
  intent: 'auto-approve smoke',
});
await show('get_order_status', { order: q.order });
await client.close();
