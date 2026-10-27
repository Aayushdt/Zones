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
