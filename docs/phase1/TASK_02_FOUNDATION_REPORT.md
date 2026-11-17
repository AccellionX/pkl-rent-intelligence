# Task #2 — Domain & Backend Foundation Report

**Status:** **PARTIAL**  
**Date:** 2026-11-17  
**Scope completed in-repo:** schema, RLS, typed Supabase clients, auth helpers, API skeleton, calc/privacy stubs, tests, docs  
**Blocked without credentials:** live Supabase connectivity, authenticated cross-org RLS proof against a real project, storage round-trip

No deployment, commits, pushes, extraction, Claude, final PDF pipeline, or Google Drive integration were performed.

---

## 1. Files added / changed

### Added

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260317120000_phase1_foundation.sql` | Full Phase 1 schema, triggers, RLS, private storage buckets/policies |
| `supabase/config.toml` | Minimal Supabase CLI project config |
| `.env.example` | Public + server env placeholders (no secrets) |
| `src/domain/types.ts` | Live-mode domain types |
| `src/domain/database.types.ts` | Hand-maintained Supabase `Database` typing |
| `src/domain/schemas.ts` | Zod request validation |
| `src/domain/report-status.ts` | Valid report status transitions |
| `src/lib/supabase/env.ts` | Demo vs live mode detection |
| `src/lib/supabase/client.ts` | Browser anon client |
| `src/lib/supabase/server.ts` | Cookie/session server client |
| `src/lib/supabase/admin.ts` | `server-only` service-role client |
| `src/lib/auth/session.ts` | `requireAuth` (demo ⇒ 503, live unauth ⇒ 401) |
| `src/lib/auth/authorize.ts` | Org/property membership checks |
| `src/lib/api/*` | Errors, JSON helpers, parse, omitUndefined |
| `src/lib/calculations/*` | Pure calc interfaces + `$25` flag helper; formula stubs |
| `src/lib/privacy/client-report-payload.ts` | Client PDF/payload PII scanner |
| `src/app/api/health/route.ts` | Mode/health endpoint |
| `src/app/api/properties/**` | Property CRUD + unit-types + reports + comparables list |
| `src/app/api/unit-types/[id]/route.ts` | Unit type get/patch/delete |
| `src/app/api/reports/[id]/**` | Report get/patch + status transition |
| `src/proxy.ts` | Supabase session refresh (Next.js 16 proxy) |
| `tests/unit/*.test.ts` | Validation, auth boundaries, demo-mode API, calc/privacy |
| `vitest.config.ts` | Vitest + `@/` alias |
| `docs/phase1/TASK_02_FOUNDATION_REPORT.md` | This report |

### Changed

| Path | Change |
|------|--------|
| `package.json` / `package-lock.json` | Added `@supabase/ssr`, `@supabase/supabase-js`, `server-only`, `vitest`; `test` scripts |
| `.gitignore` | Allow committing `.env.example` |
| `README.md` | Demo vs live modes, Supabase setup, verification |
| `src/app/layout.tsx` | Typed `children: ReactNode` so `tsc` works without generated `LayoutProps` |

### Intentionally untouched (demo preservation)

- `src/store/demo-store.ts`
- `src/data/veterans.ts`, `portfolio-seed.ts`, demo `src/data/types.ts`
- Demo pages/components (buildings, pricing, upload, PDF UI)
- `src/lib/pdf-report.ts`, `src/lib/parse-upload.ts`

---

## 2. Architecture summary

```
Demo UI (unchanged)
  └─ Zustand / localStorage / seed data

Live foundation (new)
  Browser ──anon──▶ Supabase Auth (session cookies)
  Next.js API routes ──user JWT + RLS──▶ Postgres / Storage
  src/lib/supabase/admin.ts ──service role──▶ server-only privileged ops (unused by CRUD routes)
  Pure modules: domain schemas, report transitions, calculations stubs, PII scan
```

- **No Nest/Express.** Application operations live in App Router `route.ts` handlers.
- **Mode split:** missing public Supabase env ⇒ explicit `demo` mode; live APIs return `503 demo_mode` and **do not** serve seed data.
- **Auth enforcement** is server-side in API helpers; proxy only refreshes cookies when configured and does not lock demo pages.

---

## 3. Database schema summary

Normalized tables (see migration for full DDL):

1. `organizations` + `organization_members` (roles: owner/admin/member; creator auto-owner trigger)
2. `properties` (address, marketing name, geo, external links JSON, Drive folder id placeholder)
3. `unit_types` (per property; beds/baths/label)
4. `subject_units` (subject inventory tied to unit type)
5. `comparable_properties` (**property-level** membership shared across unit types)
6. `comparable_unit_data` (per unit type + source; `status=missing` / `has_available_data=false` supported)
7. `report_runs` (property + unit type + period + lifecycle status)
8. `source_documents` (type, format, storage path, parse status)
9. `extracted_values` (raw/normalized, confidence, review status, provenance refs)
10. `review_decisions` (**append-only**; update/delete triggers raise)
11. `report_snapshots` (versioned payload; identity/payload immutable; Drive confirm fields updatable)
12. `report_photos` (subject/comp refs, source, crop metadata JSON)
13. `weekly_metrics` (Zillow/Apartments JSON + tour counts; staff notes separate)

**Report statuses:** `in_progress` → `waiting_on_review` ⇄ `in_progress` → `sent` → `saved_to_drive` (terminal).

**Storage buckets (private):** `source-documents`, `report-photos`, `generated-reports` with path prefix `{organization_id}/…`.

---

## 4. API endpoints implemented

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/health` | none | Returns `mode`, `supabaseConfigured`, `liveApiEnabled` |
| GET/POST | `/api/properties` | required (live) | List requires `organizationId`; create requires membership |
| GET/PATCH/DELETE | `/api/properties/[id]` | required | Org boundary via property access helper + RLS |
| GET/POST | `/api/properties/[id]/unit-types` | required | |
| GET/PATCH/DELETE | `/api/unit-types/[id]` | required | |
| GET/POST | `/api/properties/[id]/reports` | required | Creates `in_progress` runs |
| GET/PATCH | `/api/reports/[id]` | required | Blocks edits when `saved_to_drive` |
| POST | `/api/reports/[id]/transition` | required | Enforces transition graph |
| GET | `/api/properties/[id]/comparables` | required | Read-only comps + optional `unitTypeId` unit data |

All JSON responses include `mode`. Demo mode write/list handlers return **503 / `demo_mode`**.

---

## 5. Auth / RLS design

- Browser + API user clients use **anon key + user session** only.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (`server-only` module); never `NEXT_PUBLIC_`.
- RLS enabled on all domain tables; access gated by `is_org_member(organization_id)` / admin helpers.
- Storage policies mirror org membership using the first path segment as org UUID.
- Review decisions insert requires `reviewer_user_id = auth.uid()`.
- API layer double-checks membership before mutations (defense in depth).

**Not live-tested:** applying migration to a real Supabase project and proving RLS with two users (see Blocked).

---

## 6. Demo compatibility evidence

- Demo store / Veterans seed / PDF / upload pages were **not** modified for product behavior.
- Without Supabase env, `getAppMode()` → `demo`; `/api/health` reports `liveApiEnabled: false`.
- Unit test `tests/unit/demo-mode-api.test.ts` asserts property POST/GET return `demo_mode` and **no seed payload**.
- Existing UI routes still build and remain available (`/` , `/buildings`, Veterans deep links, etc.).
- localStorage key `pkl-rent-intelligence-demo` unchanged.

---

## 7. Commands run and results

| Command | Result |
|---------|--------|
| `npm install` (+ Supabase / vitest / server-only) | OK (vitest pinned to v3 for `@types/node` 20 peer) |
| `npm test` | **PASS** — 5 files, 22 tests |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** (0 errors after calc stub cleanup) |
| `npm run build` | **PASS** — includes new `/api/*` routes + proxy |

**Not run / blocked:** `supabase db push`, authenticated HTTP calls against a real project, storage upload smoke test.

---

## 8. Known limitations

1. No live Supabase project wired in this environment — migration not applied remotely here.  
2. No org/property UI wired to live APIs yet (foundation only).  
3. Extraction, Claude narratives, final multi-page PDF, and Drive save are **out of scope** for Task #2.  
4. Full pricing formulas (`averageSameAddressUnits`, `computeApprovedCompStats`, …) intentionally throw “not implemented”.  
5. Hand-maintained `database.types.ts` covers tables used by APIs; regenerate from Supabase CLI after schema evolves.  
6. Cross-org isolation proven in unit helpers + RLS SQL; **not** proven against a live DB in this task.  
7. Organization bootstrap beyond creator-owner trigger (invites, admin UI) not built.

---

## 9. Required Supabase configuration

1. Create project; copy `.env.example` → `.env.local`.  
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.  
3. Apply `supabase/migrations/20260317120000_phase1_foundation.sql` (`supabase db push` or SQL editor).  
4. Enable Email (or SSO) Auth; create staff users.  
5. Insert organization (creator becomes owner automatically).  
6. Confirm private buckets exist and Auth session cookies work with `/api/properties`.

---

## 10. Recommended next task

**Task #3 — Source document upload + Rentometer tabular import into reviewable extracted values / comparable candidates**, building on:

- `source_documents` + private `source-documents` bucket  
- `extracted_values` + `review_decisions` append-only rules  
- property/unit-type/report APIs from this foundation  
- calculation stubs to begin implementing same-address averaging and approved-comp stats once curated comps exist  

Keep demo UI intact; add live workflows behind auth without mixing seed data.
