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
