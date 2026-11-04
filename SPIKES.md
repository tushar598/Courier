# Tier 0 Spikes

## S1 — Bitrefill MCP (key, tools/list, TOON, test purchase)

| Step | Result | Time | Notes |
|------|--------|------|-------|
| Endpoint reachable | PASS | 12:11 | `POST /mcp` with no key → `401 www-authenticate: Bearer error="invalid_token"`. Cloudflare, BOM edge. |
| initialize with API key | — | | blocked: API key |
| tools/list captured | — | | |
| TOON decoded | — | | |
| Test purchase end to end | — | | blocked: mentor must enable test products |

## S2 — Zipher shielded memo

| Step | Result | Time | Notes |
|------|--------|------|-------|
| Clone | PASS | 12:11 | HEAD `eced13d` (8 Jun 2026). Needs `git submodule update --init` (ows-core). |
| Build zipher-cli | — | | |
| Wallet init (testnet) | — | | |
| Sync | — | | |
| Shielded send w/ memo | — | | Risk: crates pinned "NU6.2 cohort"; Ironwood is NU6.3. |

## Gate 13:30 decision
_pending_
