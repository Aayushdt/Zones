# Deferred Architectural & Product Decisions

This document tracks audit findings and enhancement proposals that require larger product, identity, infrastructure, or third-party service commitments before implementation.

---

## I-005: Host Preset Cloud Synchronization

- **Audit Lead:** IMPROVEMENTS.md (I-005: Synchronize host presets across devices)
- **Status:** DEFERRED (Gated on Identity Architecture)
- **Evaluation Date:** 2026-10-28

### Gating Evaluation

1. **Persistent Authenticated Users:** **FAIL**. The application currently operates strictly on ephemeral anonymous guest sessions (`auth.signInAnonymously()`, stored in `localStorage` as `xzones.guest_session`). Anonymous sessions are bound to a single browser/device profile. Cross-device sync cannot function without an established identity linking mechanism (e.g., email magic links, Apple/Google OAuth, or Passkeys).
2. **Data Access Pattern:** Requires adherence to the backend Edge Function API (`backend/supabase/functions/api`) rather than direct client table access, enforcing rate limits and hostile payload validation.
3. **Database Environment:** Verified migrations on local Postgres runner; schema patterns established.

### Proposed Architecture & Design Specification

When account linking (Phase B) is scheduled, the following architecture should be implemented:

#### 1. Database Migration & RLS

```sql
-- Migration: 202611010001_host_presets.sql
CREATE TABLE public.host_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preset_key TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT host_presets_user_key_unique UNIQUE (user_id, preset_key),
  CONSTRAINT host_presets_name_len CHECK (char_length(name) BETWEEN 1 AND 60),
  CONSTRAINT host_presets_config_size CHECK (octet_length(config::text) <= 16384)
);

CREATE INDEX idx_host_presets_user ON public.host_presets(user_id);

ALTER TABLE public.host_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Host presets owner select"
  ON public.host_presets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Host presets owner insert"
  ON public.host_presets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Host presets owner update"
  ON public.host_presets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Host presets owner delete"
  ON public.host_presets FOR DELETE
  USING (auth.uid() = user_id);
```

#### 2. API Contract & Validation

- `GET /api/presets`: Returns list of saved presets for the authenticated user.
- `PUT /api/presets/:key`: Upserts preset by key. Payload validated against `LobbyConfigSchema` (maximum size 16 KB, strictly no PII).
- `DELETE /api/presets/:key`: Removes preset by key.
- Rate limiting: 10 requests / minute per `auth.uid()` using the existing sliding-window limiter.

#### 3. Conflict Resolution & Offline Strategy

- **Strategy:** Last-write-wins based on monotonic `updated_at`.
- **Local Fallback:** `localStorage` (`xzones.host_presets`) remains the primary offline cache. When offline, changes are queued locally. When online, local and remote presets are merged, keeping the record with the higher `updated_at` or `version`.

#### 4. Open Questions & Product Decisions

1. Should anonymous hosts be allowed to transfer presets via QR code export/import prior to full account linking?
2. Maximum preset quota per host (recommended: 20 presets).

---

## I-002: Offline Map Tiles Pre-Caching

- **Audit Lead:** IMPROVEMENTS.md (I-002: Offline map tile pre-caching)
- **Status:** DEFERRED (Gated on Tile Provider ToS & Architecture)
- **Evaluation Date:** 2026-10-28

### Gating Evaluation

1. **Tile Source & ToS Permissibility:** **FAIL**. The application default tile provider is OpenFreeMap (`https://tiles.openfreemap.org`), a community-funded public service. Mass automated pre-fetching of hundreds of vector tiles and glyphs across zoom ranges (e.g. 13–17) for geometric bounding boxes violates terms of use for public hosted endpoints and risks IP throttling.
2. **Service Worker Interception:** **PASS (Existing)**. Verified in `apps/web/public/sw.js:29-50` that the app already features a production service worker that transparently intercepts OpenFreeMap GET requests, serves cached tiles with stale-while-revalidate semantics, and bounds storage using an LRU eviction cap (`tileCacheLimit` derived from `HIDE_AND_SEEK_CONFIG.map.tileCacheEntries.default` = 1200).
3. **Player UX & Cross-Device Scope:** **FAIL**. `CacheStorage` is local to each player's individual device browser. A host downloading tiles on their device provides zero cache benefits to hunters or runners on their respective phones. Requiring every player to execute a multi-megabyte prefetch on field cellular networks before game start is unviable.
4. **Offline Fallback:** **PASS (Existing)**. `apps/web/src/utils/map-tactical-style.ts` provides `createTacticalFallbackStyle()`, a zero-network vector style that functions 100% offline without remote fonts or sprites, allowing full GPS navigation and boundary rendering even in total network dead zones.

### Proposed Architecture & Strategic Alternatives

When offline map enhancements are prioritized, the recommended alternatives are:

#### Alternative A: Self-Hosted PMTiles (Recommended for Native/Offline)
- Package local metropolitan or regional vector tiles as a single `.pmtiles` archive served via HTTP range requests or embedded into the native app assets (Phase B).
- Eliminates third-party ToS violations and provides instant, zero-latency vector rendering without recursive tile pre-fetching.

#### Alternative B: Enhanced Runtime LRU Caching (Current Web Pattern)
- Rely on the active service worker cache in `apps/web/public/sw.js`.
- As players view the map in the lobby or during calibration, viewed tiles are automatically persisted to `xzones-map-tiles-v1`.
- If connectivity drops in the field, MapLibre GL continues to render cached tiles, falling back gracefully to `createTacticalFallbackStyle()` if new tiles are unreachable.

---

## UI-G-001: Full GeoJSON Symbol Layer Migration for Player Markers

- **Proposal:** Replace MapLibre DOM markers (`pointElement`) entirely with a GeoJSON FeatureCollection source and WebGL symbol/circle layers.
- **Status:** DEFERRED (Gated on Visual Design & RAF Smoothing Quality)
- **Evaluation Date:** 2026-10-28

### Gating Evaluation

1. **Player Scale vs Overhead:** For real-world outdoor Hide & Seek matches (typically 2 to 12 players per match), DOM markers introduce minimal DOM node overhead (<15 elements total).
2. **Animation & Smoothing:** `GameMap.tsx` currently provides 60fps linear coordinate interpolation (`interpolateMapCoordinate`) via `requestAnimationFrame` on DOM markers. GeoJSON symbol layers require updating feature geometries on every RAF tick or running a custom shader, which increases complexity and battery draw without visual gain.
3. **Prop Stabilization Solves Root Bottleneck:** Profiling in Step 2 proved that the true bottleneck is timer-driven prop invalidation, not DOM marker rendering. Isolating the HUD timer and memoizing coordinate values eliminates 95%+ of MapLibre re-evaluations.

### Proposed Architecture for Future High-Density Matches (>50 Players)

When high-density spectator tournaments (>50 concurrent players on screen) are introduced:
1. Implement a GeoJSON `xzones-players` source with dynamic GeoJSON updates throttled to 2Hz.
2. Render players using MapLibre `circle` layers with data-driven expressions for team colors (`#00FF89` vs `#FF3B3C`) and staleness opacity.


