# Friction & Feedback

Each entry: what we expected (docs), what happened (live), repro, suggested fix.

## Bitrefill

### F1 — Rate limit headers disagree with docs

- **Docs:** 30 requests / minute / token.
- **Live (12:11 IST, unauthenticated):** `ratelimit-limit: 60`, `ratelimit-policy: 60;w=30` → 60 per 30 s window.
- **Repro:** `curl -si -X POST https://api.bitrefill.com/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | grep -i ratelimit`
- **Note:** may differ when authenticated; re-check with key.
- **Suggested fix:** document per-tier limits, or link the `ratelimit-policy` header semantics in the MCP docs.

## Zcash / Zipher

### F2 — Shallow clone fails to build without submodule

- **Expected:** `cargo build -p zipher-cli` after clone.
- **Actual:** `failed to read .../ows-core/ows/crates/ows-signer/Cargo.toml` (git submodule `ows-core` → `github.com/Kenbak/core`).
- **Suggested fix:** README build section: `git clone --recursive` or `git submodule update --init`.

### F3 — Zipher pinned to NU6.2 crate cohort, last commit 8 Jun 2026; Ironwood (NU6.3) live since 28 Jul

- **Risk:** transactions built with a pre-NU6.3 consensus branch ID are rejected post-activation.
- **Status:** under test in S2.

### F4 — Zipher HEAD (`eced13d`) does not compile from a clean checkout

- **Actual:** `error[E0432]: unresolved imports ...create_proposed_transactions_with_expiry_delta, ...propose_zip317_transfer_to_address_with_marginal_fee` in `crates/engine/src/send.rs`.
- **Cause:** `rust/Cargo.toml` `[patch.crates-io]` points `zcash_client_backend`/`zcash_primitives` at `horizontalsystems/librustzcash` branch `feature/custom-fee-expiry-api`, which is at 0.22.0 / 0.27.1. The engine requires 0.23 / 0.28, so cargo prints `patch ... was not used in the crate graph` and falls back to crates.io 0.23 (no custom-fee APIs). No `rust/Cargo.lock` is committed to pin a working rev.
- **Workaround:** repoint both patches to branch `hs/custom-fee-expiry-nu6.2-sdk-compatible` (0.23.0 / 0.28.0).
- **Suggested fix:** pin patches by `rev =` not `branch =`, and commit `rust/Cargo.lock`.

### F5 — npm installer for `@cipherpay/zipher-cli` downloads release binaries without checksum verification

- `npm/install.js` fetches `github.com/<repo>/releases/download/cli-v<version>/<artifact>` and runs it; no SHA-256 check. npm `0.3.0` (26 Jun) is also newer than repo HEAD (8 Jun), so the published binary cannot be reproduced from public source.
- **Suggested fix:** ship checksums in the npm package and verify before chmod +x; tag the source commit for each `cli-v*` release.

### F6 — npm `@cipherpay/zipher-cli@0.3.0` points at a GitHub release that does not exist

- `install.js` downloads `releases/download/cli-v${version}/…`; the only published release is `cli-v0.2.0` (28 Apr 2026). Installing 0.3.0 → HTTP 404 in postinstall.
- (Correction to F5: releases _do_ publish `.sha256` files; the installer just doesn't check them.)
- **Suggested fix:** publish `cli-v0.3.0` assets (or pin npm to 0.2.0) and verify `.sha256` in `install.js`.

### F7 — Default Zipher testnet lightwalletd rejects HTTP/2

- `zipher-cli --testnet wallet init` → `transport error: received fatal alert: NoApplicationProtocol`.
- **Repro:** `openssl s_client -connect lightwalletd.testnet.cipherscan.app:443 -alpn h2` → TLS alert 120 (no_application_protocol). gRPC needs h2.
- **Workaround:** `--server https://testnet.zec.rocks:443` (negotiates h2).
- **Note:** on a failed init, the OWS vault wallet is still created; a re-run says "already exists — reusing it" (good: idempotent).

### F8 — OWS vault is global per `$HOME`, not per `--data-dir`

- Two `wallet init` calls with different `--data-dir` reuse the same OWS wallet `default` → same seed. Running relay + buyer wallets on one machine needs `HOME=<other dir>`.
- **Suggested fix:** `--ows-wallet <name>` flag or derive the OWS wallet name from data-dir.

### F9 — Testnet faucets unavailable from hackathon network (12:31 IST)

- `testnet.zecfaucet.com` (the faucet URL embedded in Zipher) → no connection; `testnet.cipherscan.app/faucet` → bare 429.

## Bitrefill (with API key)

### F10 — Documented `/mcp/<API_KEY>` URL returns 410 Gone

- **Docs:** `https://api.bitrefill.com/mcp/<API_KEY>`.
- **Live (16:20 IST):** `POST /mcp/<KEY>` → `HTTP 410 {"jsonrpc":"2.0","error":{"code":-32000,"message":"This endpoint has b…"}}`. `POST /mcp` with `Authorization: Bearer <KEY>` → 200.
- **Suggested fix:** update docs to the Bearer header (also safer: keys in URLs end up in proxy and client logs).

### F11 — Rate limit confirmed at 60 per 30 s when authenticated

- `ratelimit-policy: 60;w=30` with a valid key too. Docs say 30/min (4x lower). See F1.

### F12 — Tool descriptions steer the model toward secrets and external instructions

- `list-invoices` description: "Use get-invoice-by-id for one invoice's orders and codes."
- `search-products` description: tells the model to "read https://www.bitrefill.com/agents/SKILL.md before the first purchase".
- `get-invoice-by-id` only _requires_ `invoice_id`; with an account API key the access token is optional, so any model holding the key can list every past invoice and read its codes.
- **Not a vulnerability** (the key is the owner's), but a design gap for agent use: one key = full read access to purchase history. **Suggested fix:** scoped API keys (e.g. `purchase-only`, no `list-invoices` / code read), and a response flag to omit `redemption_info`.

### F13 — Test products: silent empty result when not enabled

- `search-products {"query":"syldavia","country":"KN"}` → `found: 0`; `get-product-details delos-syldavia` → `product_not_found`, no hint that test products need enabling.
- **Suggested fix:** a `test_products_enabled` field in `get-balances` or a hint in the not-found error for `*-syldavia` slugs.

### F14 — Mixed tool naming

- Kebab-case (`search-products`, `get-invoice-by-id`) alongside snake_case (`search_help_articles`, `get_help_article`).

### F15 — No current agent wallet can send on testnet: NU7 is already active there

- `testnet.zcashexplorer.app/api/v1/blockchain-info` (16:25 IST): `NU7 activationheight 4465026 active`, `NU6.3 4134000 active`, tip branch `77190ad9`.
- Zipher's only release (`cli-v0.2.0`, 28 Apr) predates both NU6.3 and NU7; source HEAD (8 Jun) is "NU6.2 cohort" and does not compile (F4). Receiving (compact-block scan) still works, so a wallet looks healthy until it tries to spend.
- **Suggested fix:** Zipher: an NU7-ready release before mainnet NU7 (expected 5–6 Nov), and a startup check that refuses to build a tx when the server's `consensus_branch_id` is unknown (the source already logs a mismatch in `sync.rs` but only as a warning).
