# XZones

XZones is an original outdoor Hunter vs Runner hide-and-seek game for small groups of friends, using scheduled location snapshots and in-person tagging. The implementation plan is in [xzones.md](./xzones.md).

## Run locally

Install the pinned workspace package manager with Corepack, then start the web shell:

```sh
corepack pnpm install
corepack pnpm --filter @xzones/web dev
```

To connect private create/join forms, put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `apps/web/.env.local` and restart Vite. Keep server values in the Supabase Function environment; never put a service-role key in the web env file. `.env.example` contains names only.

Gameplay maps use MapLibre with OpenFreeMap dark/bright styles by default; provide `VITE_MAP_STYLE_URL` in `apps/web/.env.local` only if you want to override the style URL. Keep the required map attribution visible.
