# Courier — Build Plan (Free Society Hack, 4 Nov 2026)

Window: 11:30 → 00:00 IST. Feature freeze 23:00. Team: 1 human + Claude Code (scope set for this; see Assumptions).

## Tier 0 — Spikes (gate 13:30)

| #   | Task                                                                                 | Target | Owner                                       | Status          |
| --- | ------------------------------------------------------------------------------------ | ------ | ------------------------------------------- | --------------- |
| 0.1 | Repo, pnpm workspace, tooling (TS strict, ESLint, Prettier, vitest)                  | 12:30  | Claude                                      | ✅ 12:14        |
| 0.2 | S1a: Bitrefill MCP initialize + tools/list, capture schemas to `fixtures/bitrefill/` | 12:45  | Claude (needs API key)                      | ⛔ blocked: key |
| 0.3 | S1b: TOON sample captured + decoder passes on it                                     | 13:00  | Claude                                      | ⏳              |
| 0.4 | S1c: one `-syldavia` test purchase end to end (buy → poll → redemption_info)         | 13:15  | Claude (needs mentor-enabled test products) | ⛔ blocked      |
| 0.5 | S2: zipher-cli builds, testnet wallet, sync, shielded memo to 2nd address            | 13:15  | Claude (needs testnet TAZ)                  | ⏳              |
| 0.6 | **Gate 13:30**: S2 fail → vault-only delivery + receipt memo; record in SPIKES.md    | 13:30  | Human                                       | —               |

## Tier 1 — Must ship (target 18:30)

| #   | Task                                                                                                                   | Target |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1 | `core`: TOON decoder, Zod schemas from captured tools/list, Bitrefill MCP client (rate-limited, retries)               | 14:30  |
| 1.2 | `core`: handle store (AES-256-GCM at rest, TTL, opaque IDs), schema-based redactor (allowlist output, not denylist)    | 15:00  |
| 1.3 | `core`: policy engine (types, countries, per-order cap, daily cap, approval threshold) + tests                         | 15:30  |
| 1.4 | `mock-bitrefill`: local MCP server serving fixtures incl. hostile product description                                  | 16:00  |
| 1.5 | `gateway`: MCP server (stdio + Streamable HTTP): search_products, get_product_details, propose_order, get_order_status | 17:00  |
| 1.6 | Required tests: no-secret property test, self-approval impossible, caps, injection neutralised                         | 17:30  |
| 1.7 | `console` (Next.js): pending / approved / paid / delivered, approve/deny, vault, spend log                             | 18:30  |
| 1.8 | Live run in Claude Code against real Bitrefill test products                                                           | 18:30  |

## Tier 2 — Zcash memo delivery (target 20:00)

| 2.1 | Delivery adapter: zipher-cli propose+confirm with memo; ≤512-byte encoder; vault pointer for overflow | 19:30 |
| 2.2 | Structured memo format v0 (`courier:v0`) — doubles as partner milestone spec | 20:00 |

## Tier 3 — Real rail (target 22:30)

| 3.1 | Relay: detect shielded ZEC payment w/ handle memo (poll zipher-cli transactions) | 21:00 |
| 3.2 | Create `usdc_base` invoice, settle via x402 from Base float (@x402/fetch), < 15 min window | 22:00 |
| 3.3 | One real small purchase, recorded on video; capture txid + invoice_id | 22:30 |

## Tier 4 — Ship (freeze 23:00)

| 4.1 | Attack demo: baseline agent → mock leaks; same agent via Courier → nothing to leak | 22:45 |
| 4.2 | Deploy demo mode (no creds) to Vercel | 23:15 |
| 4.3 | README (video, URL, diagram, proof, 30-day milestone), FRICTION, DECISIONS final | 23:35 |
| 4.4 | 2-minute video, submit | 23:55 |

## Cut order if late

Tier 3 → real-rail video becomes "simulated rail" (labelled). Tier 2 → vault-only + receipt memo. Never cut: tests, attack demo, demo-mode deploy, README.

## Re-plan 16:50 (solo, S2 failed, test products not enabled)

| Step    | Scope                                                                                                   | Status              |
| ------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| 1       | core service + mock + gateway + required tests                                                          | ✅ 17:07 (33 tests) |
| 2       | approval console (pending/approve/reject, vault + eSIM QR, spend vs cap, activity log, demo `/api/mcp`) | ✅ 17:11            |
| 3       | one real $3.89 eSIM through Courier, human-approved (needs user OK)                                     | ⏳                  |
| 4       | attack demo + deploy demo mode                                                                          | ⏳                  |
| 5       | README, video, submit                                                                                   | ⏳                  |
| stretch | Zcash receipt memo (NU7-capable wallet), x402 relay                                                     | cut unless time     |
