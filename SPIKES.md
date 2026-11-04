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
| Build zipher-cli from source | FAIL | 12:26 | 3 attempts. HEAD won't compile (F4); fixing the patch exposes duplicate `zcash_protocol`/`zcash_transparent`, then `frost_core` (365 errors). Abandoned at 12:26. |
| Use release binary | PASS | 12:27 | `cli-v0.2.0` darwin-arm64 (28 Apr 2026), SHA-256 verified `ca93407d…328fa`. Only release published (F6). |
| Wallet init (testnet) | PASS | 12:30 | Default server `lightwalletd.testnet.cipherscan.app` fails TLS ALPN (F7); used `--server https://testnet.zec.rocks:443`. Relay + buyer wallets (separate `HOME` → separate OWS vault). Seeds in `secrets/` (0600, gitignored), never printed. |
| Fund relay with TAZ | BLOCKED | 12:31 | `testnet.zecfaucet.com` unreachable; `testnet.cipherscan.app/faucet` → 429. Needs human (browser faucet or mentor). |
| Sync | RUNNING | 12:30 | |
| Shielded send w/ memo | — | | Risk: crates pinned "NU6.2 cohort"; Ironwood is NU6.3. |

## Gate 13:30 decision
_pending_
