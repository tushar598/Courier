# Decisions (one line each, newest last)

- 12:10 — pnpm workspace: `packages/core`, `packages/gateway`, `packages/mock-bitrefill`, `apps/console`; TypeScript strict, Zod, vitest.
- 12:10 — Vendor third-party source (Zipher) under gitignored `.vendor/`, never committed.
- 12:12 — pnpm installed via corepack into `~/.local/bin` (no write access to `/usr/local`).
- 12:12 — `wallet init` seed output goes to a gitignored 0600 file, never into agent/LLM context (we eat our own dog food).
- 12:12 — Redaction is allowlist-by-schema (gateway builds results from known-safe fields), not denylist regex; regex scan is only a second defensive layer.
- 12:12 — Mock Bitrefill is a separate package so tests, attack demo and the no-credentials demo mode share one fixture source.
