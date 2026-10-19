# Gameplay verification — Stage 0 environment

## Proven checkout

- Repository: `https://github.com/Aayushdt/Zones.git`
- Branch created for this run: `verify/gameplay`
- Base branch: `fix/review-findings`
- Base/verified commit: `88b59d79bd704b2c654d5eb7631582c44dc57449`
- Clone used for the clean install/build checks: `/tmp/xzones-gameplay-clean`, cloned from `fix/review-findings` at that commit.
- The working repository was clean before verification-only files were added.

## Runtime versions observed

| Component | Version / result |
|---|---|
| Node.js | `v24.19.0` |
| pnpm | `12.14.0` |
| Supabase CLI | `2.121.0` |
| Deno | `2.9.6` |
| Playwright | `1.64.1` |
| Browser package | Chromium installed by Playwright; executable revision `1248` |
| PostgreSQL client/server tools | `18.6` |

## Commands run against the clean clone

| Command | Observed result |
|---|---|
| `corepack pnpm install --frozen-lockfile --store-dir=/tmp/xzones-gameplay-pnpm-store` | Passed; 126 packages installed from the frozen lockfile. |
| `corepack pnpm typecheck` | Passed; game-core typecheck and production web build completed. |
| `corepack pnpm lint` | Exit 0; existing React effect/dependency warnings were printed. |
| `corepack pnpm test:unit` | Passed: 4 files, 23 tests. |
| `corepack pnpm --filter @xzones/web build` | Passed; Vite printed its generic large-chunk warning. |
| `SUPABASE_TELEMETRY_DISABLED=1 corepack pnpm exec supabase start` | Blocked: Docker is installed but the current user cannot access `/var/run/docker.sock` (`permission denied`). No Supabase containers were started. |

The browser version is the Playwright-managed Chromium revision, not a separately installed Chrome version. The clean clone has no `.env.local`; no credentials were copied into the clone or report.

## Environment boundary

The checks above ran in a clean local clone. They do not prove live Auth, Postgres policies, Edge Function behavior, Realtime delivery, or full-match gameplay. The existing CI workflow has a `supabase-realtime` job that starts the actual Supabase stack and serves `api`, but it triggers on pull requests and does not run this verification suite or upload the requested gameplay artifacts. Until a run from that job is observed, all Supabase-dependent gameplay claims remain unverified.

## Local preview

The production build was served with Vite preview at `http://127.0.0.1:4175/`. Loopback is a secure context for browser geolocation/camera APIs, but no location or camera permission was granted during this Stage 0 check.
