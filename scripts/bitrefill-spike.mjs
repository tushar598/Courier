#!/usr/bin/env node
// S1 spike: talk to the real Bitrefill MCP without ever printing the API key
// or bearer secrets. Raw responses go to secrets/bitrefill-raw/ (gitignored);
// stdout only shows a redacted view.
//
//   node scripts/bitrefill-spike.mjs list
//   node scripts/bitrefill-spike.mjs call <tool> '<json-args>' <name>
import { mkdirSync, writeFileSync } from 'node:fs';
import { decode as decodeToon } from '@toon-format/toon';

process.loadEnvFile(new URL('../.env', import.meta.url));
const KEY = process.env.BITREFILL_API_KEY ?? '';
if (!KEY) throw new Error('BITREFILL_API_KEY missing in .env');
const BASE = (process.env.BITREFILL_MCP_URL || 'https://api.bitrefill.com/mcp').replace(/\/$/, '');

const SENSITIVE =
  /token|secret|code|pin|link|url|redemption|install|password|key|voucher|serial|activation|qr/i;
const scrub = (s) => String(s).split(KEY).join('<KEY>');

function redact(v, k = '') {
  if (Array.isArray(v)) return v.map((x) => redact(x, k));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, redact(vv, kk)]));
  }
  if (typeof v === 'string' && SENSITIVE.test(k) && !/^(slug|country_code|currency)$/i.test(k)) {
    return `<redacted len=${v.length}>`;
  }
  return v;
}

let id = 0;
let authMode = 'bearer'; // /mcp/<API_KEY> now returns 410 (see FRICTION F10)
async function rpc(method, params) {
  const url = authMode === 'path' ? `${BASE}/${KEY}` : BASE;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (authMode === 'bearer') headers.Authorization = `Bearer ${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const rl = ['ratelimit-limit', 'ratelimit-policy', 'ratelimit-remaining', 'mcp-session-id']
    .map((h) => `${h}=${res.headers.get(h) ?? '-'}`)
    .join(' ');
  const ct = res.headers.get('content-type') ?? '';
  const text = await res.text();
  console.error(`[${method}] HTTP ${res.status} ct=${ct.split(';')[0]} ${rl}`);
  if (!res.ok) throw new Error(scrub(`HTTP ${res.status}: ${text.slice(0, 300)}`));
  let msg;
  if (ct.includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    msg = JSON.parse(data.at(-1));
  } else {
    msg = JSON.parse(text);
  }
  if (msg.error) throw new Error(scrub(JSON.stringify(msg.error)));
  return msg.result;
}

async function init() {
  try {
    return await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'courier-spike', version: '0.0.1' },
    });
  } catch (e) {
    console.error(`path auth failed (${e.message.slice(0, 80)}); trying bearer header`);
    authMode = 'bearer';
    return rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'courier-spike', version: '0.0.1' },
    });
  }
}

const [cmd, tool, argJson, name] = process.argv.slice(2);
mkdirSync(new URL('../secrets/bitrefill-raw/', import.meta.url), { recursive: true });
mkdirSync(new URL('../fixtures/bitrefill/', import.meta.url), { recursive: true });

const info = await init();
console.log(
  `auth=${authMode} server=${JSON.stringify(info.serverInfo)} protocol=${info.protocolVersion}`,
);

if (cmd === 'list') {
  const r = await rpc('tools/list', {});
  // Tool schemas carry no secrets; keep them as committed fixtures.
  writeFileSync(
    new URL('../fixtures/bitrefill/tools-list.json', import.meta.url),
    scrub(JSON.stringify(r, null, 2)),
  );
  for (const t of r.tools) {
    const props = Object.keys(t.inputSchema?.properties ?? {});
    const req = t.inputSchema?.required ?? [];
    console.log(`- ${t.name}(${props.map((p) => (req.includes(p) ? p + '*' : p)).join(', ')})`);
  }
} else if (cmd === 'call') {
  const r = await rpc('tools/call', { name: tool, arguments: JSON.parse(argJson ?? '{}') });
  writeFileSync(
    new URL(`../secrets/bitrefill-raw/${name}.json`, import.meta.url),
    scrub(JSON.stringify(r, null, 2)),
  );
  console.log(`isError=${r.isError ?? false} content parts=${r.content?.length}`);
  for (const part of r.content ?? []) {
    if (part.type !== 'text') {
      console.log(`[${part.type}]`);
      continue;
    }
    let parsed, fmt;
    try {
      parsed = JSON.parse(part.text);
      fmt = 'json';
    } catch {
      try {
        parsed = decodeToon(part.text);
        fmt = 'toon';
      } catch (e) {
        fmt = `undecodable (${e.message.slice(0, 80)})`;
      }
    }
    console.log(`--- part format=${fmt} len=${part.text.length}`);
    if (parsed !== undefined)
      console.log(scrub(JSON.stringify(redact(parsed), null, 2)).slice(0, 4000));
  }
  if (r.structuredContent) {
    console.log('--- structuredContent');
    console.log(scrub(JSON.stringify(redact(r.structuredContent), null, 2)).slice(0, 2000));
  }
} else {
  console.error('usage: list | call <tool> <json> <name>');
  process.exit(2);
}
