# Implementation Decisions and Verification Log

## Step 1: scaffold and runtime

- Scaffolded with create-vite 9.2.1; dependency resolution installed Vite 8.3.4, React/React DOM 19.3.1, TypeScript 6.0.3, and @vitejs/plugin-react 6.1.2. Exact resolutions are in apps/web/pnpm-lock.yaml.
- Corepack resolved pnpm 12.14.0. Node.js is v24.19.0 in this environment. The official Node release page lists the Node 24 line as LTS: https://nodejs.org/en/about/previous-releases.
- Vite's official guide states the runtime requirement is Node 20.19+ or 22.12+: https://vite.dev/guide/. Available Node 24 satisfies this.
- Initial TypeScript production build, Oxlint, and localhost HTTP smoke check passed in this environment. The dev server returned the XZones HTML shell.
- Not verified yet: current Supabase Free quotas/pause rules and Edge Function invocation quota/accounting; PMTiles/MapTiler/Cloudflare free eligibility; library maintenance beyond resolved package versions; hosted Supabase project details. Recheck official sources as implementation reaches those dependencies.
- Supabase CLI is not installed. Docker 29.9.1 is available. Local Supabase integration remains untested until the CLI is installed and the local stack starts.
- No Supabase URL or keys were supplied; hosted calls/deployment are not configured. Names only are in root .env.example; no secret values are stored.
