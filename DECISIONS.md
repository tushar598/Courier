# Decisions (one line each, newest last)

- 12:10 — pnpm workspace: `packages/core`, `packages/gateway`, `packages/mock-bitrefill`, `apps/console`; TypeScript strict, Zod, vitest.
- 12:10 — Vendor third-party source (Zipher) under gitignored `.vendor/`, never committed.
- 12:12 — pnpm installed via corepack into `~/.local/bin` (no write access to `/usr/local`).
- 12:12 — `wallet init` seed output goes to a gitignored 0600 file, never into agent/LLM context (we eat our own dog food).
- 12:12 — Redaction is allowlist-by-schema (gateway builds results from known-safe fields), not denylist regex; regex scan is only a second defensive layer.
- 12:12 — Mock Bitrefill is a separate package so tests, attack demo and the no-credentials demo mode share one fixture source.
- 12:16 — TOON decoding via official `@toon-format/toon` (v4.4.0) instead of a hand-rolled parser; verify against live samples in S1.
- 12:20 — Handle store: AES-256-GCM with handle id as AAD (no blob swapping), SQLite via built-in `node:sqlite` so gateway + console share state; in-memory backend for demo/tests.
- 12:20 — Policy money in integer cents; daily cap counts pending+approved+paid+delivered to prevent concurrent-proposal overspend.
- 16:24 — Bitrefill auth via `Authorization: Bearer` (path-key URL is 410). Courier never exposes `list-invoices`, `get-invoice-by-id`, `update-order`, `get-balances`, `list-saved-fiat-cards` to the model.
- 16:24 — Courier writes its own tool descriptions; upstream descriptions are untrusted text and never forwarded.
- 16:24 — Policy product types use Bitrefill's live values (e.g. `giftcards`), taken from fixtures, not docs.
