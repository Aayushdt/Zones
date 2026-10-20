# Baseline Verification — 2026-10-20

## Environment and install

- `corepack pnpm install --frozen-lockfile --store-dir /tmp/xzones-pnpm-store`: PASS — lockfile up to date; 3 workspace projects; pnpm 12.14.0. The default sandbox attempt could not open pnpm's operation lock, so the same command was rerun with writable local process access and passed.

## Gates

- `corepack pnpm typecheck`: PASS — game-core TypeScript check and web production build completed. Vite reports the existing MapLibre chunk-size warning (1,074.65 kB uncompressed; 289.61 kB gzip).
- `corepack pnpm lint`: PASS — Oxlint exit 0; existing React effect/dependency warnings in `HeadStartPage.tsx`, `PingsPage.tsx`, `TagPage.tsx`, `MatchPage.tsx`, `LobbyPage.tsx`, and `GameMap.tsx`.
- `corepack pnpm test:all`: PASS after the E2E local Vite server was rerun with local process access. Game-core: 23 tests; audit: 25; API Edge: 12; hostile API: 11; payload privacy: 2; simulator: 1; Playwright: 4; PostgreSQL DB scenarios: 14 plus schema/lifecycle smoke.
- `corepack pnpm test:db`: PASS — 14 scenario rows reported PASS; schema and lifecycle smoke completed.

## Notes

- The first E2E attempt could not start Vite under sandbox restrictions; rerunning `corepack pnpm exec playwright test` with local process access passed all 4 tests.
- Supabase-hosted Realtime and real-device GPS behavior are not part of this local baseline.
