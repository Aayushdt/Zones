# Implementation Decisions and Verification Log

## Step 1: scaffold and runtime

- Scaffolded with create-vite 9.2.1; dependency resolution installed Vite 8.3.4, React/React DOM 19.3.1, TypeScript 6.0.3, and @vitejs/plugin-react 6.1.2. Exact resolutions are in the root pnpm-lock.yaml.
- Corepack resolved pnpm 12.14.0. Node.js is v24.19.0 in this environment. The official Node release page lists the Node 24 line as LTS: https://nodejs.org/en/about/previous-releases.
- Vite's official guide states the runtime requirement is Node 20.19+ or 22.12+: https://vite.dev/guide/. Available Node 24 satisfies this.
- Initial TypeScript production build, Oxlint, and localhost HTTP smoke check passed in this environment. The dev server returned the XZones HTML shell.
- Not verified yet: current Supabase Free quotas/pause rules and Edge Function invocation quota/accounting; PMTiles/MapTiler/Cloudflare free eligibility; library maintenance beyond resolved package versions; hosted Supabase project details. Recheck official sources as implementation reaches those dependencies.
- Supabase CLI is not installed. Docker 29.9.1 is available. Local Supabase integration remains untested until the CLI is installed and the local stack starts.
- No Supabase URL or keys were supplied; hosted calls/deployment are not configured. Names only are in root .env.example; no secret values are stored.

## Step 2: workspace boundaries

- Added a pnpm workspace for `apps/*` and `packages/*`, with `@xzones/game-core` exported from a TypeScript-only module and imported by the web app. The shared package has no browser, network, or runtime dependency imports.
- Added the root TypeScript base config and root scripts. Root scripts call Corepack explicitly because this environment provides pnpm through Corepack but has no global `pnpm` executable.
- Verified the shared package typecheck, web production build, and Oxlint pass after workspace linking. The web bundle is 220.33 KB raw / 68.97 KB gzip JS; this includes only the current shell and is below the initial 250 KB compressed budget.

## Step 3: tokens, fonts, and install metadata

- Implemented the exact Dusk and Paper palette values from section 20 as CSS variables, plus persisted theme selection, the 4px spacing unit, control/sheet radii, and display/body/monospace font stacks.
- Added self-hosted variable Fontsource packages at exact registry versions: `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/manrope`, and `@fontsource-variable/jetbrains-mono` 5.3.0. Their latin font files are emitted into the production assets; no runtime font request is needed.
- Added an installable web manifest with standalone display and the scaffold icon. Step 3's production build and Oxlint passed. Theme switching is implemented; browser persistence interaction is not yet automated.

## Step 4: route and state shells

- Added the planned route table (home, create, join, lobby, head start, match, Hunter Pings, tag, results, settings, simulator, and not-found) with reusable accessible loading/empty/error/offline/success state panels.
- Added Zustand persisted preferences for Dusk/Paper theme and guest display name. The app header toggles and persists theme; routes show an explicit not-connected empty state and never fabricate a match.
- State preview links render all five status variants on the current route. Production build and Oxlint passed. Automated browser navigation and persistence checks are not added until the planned test step.
