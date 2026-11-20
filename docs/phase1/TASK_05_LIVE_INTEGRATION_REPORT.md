# Task #5 — Supabase Integration & End-to-End Validation

**Overall status:** **PASS** (conflict resolve **PARTIAL**)  
**Date:** 2026-11-17  
**Project probed:** `mqsvrastpdratvzuouxk.supabase.co` (ref only; secrets not recorded)

> **Follow-up (Task #5A):** After `AUTHORIZE APPLY ON mqsvrastpdratvzuouxk`, migrations were applied, probe → `schema_ready`, and authenticated 855 E2E passed. Details: `TASK_05A_MIGRATION_RECOVERY_REPORT.md`.

No deploy, commit, or push. Raw client documents were not uploaded to the repo. No production data was deleted.

---

## Scorecard (required)

| Area | Status | Evidence |
|------|--------|----------|
| **A. Database migrations** | **PASS** | Applied on live project (incl. org SELECT RLS fix). `task05:probe` → `schema_ready`. |
| **B. Authentication** | **PASS** | Cookie session → Next APIs; org owner membership via trigger. |
| **C. Upload storage** | **PASS** | Private buckets + live 855 CSV/PDF writes under org/property paths. |
| **D. Rentometer E2E** | **PASS** | Real 855 CSV → 23 extractions, `needs_review`. |
| **E. HelloData E2E** | **PASS** | Real 855 PDF → 21 extractions, `needs_review`. |
| **F. Conflict resolution** | **PARTIAL** | Conflicts list API OK; 0 pending after sample accepts; resolve not run. |
| **G. Approved statistics** | **PASS** | Draft stats: blended avg 1903, PSF 2.26, range 1480–2120. |
| **H. RLS isolation** | **PASS** | Second user sees 0 rows for member org. |

---

## 1. Current Supabase configuration status

| Item | Result |
|------|--------|
| `.env` present | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Set → host `mqsvrastpdratvzuouxk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set (`sb_publishable…` format) |
| `SUPABASE_SERVICE_ROLE_KEY` | Set (`sb_secret…` format) |
| `DATABASE_URL` / DB password | **Missing** |
| App mode with env | Live (`getAppMode()` → live) |
| Supabase Dashboard SQL (automation) | **Sign-in required** — no browser session available |
| Paid services created | None |

**Gotcha discovered:** `select(..., { head: true })` can return **HTTP 204 / `error: null`** even when the table is missing from PostgREST (`PGRST205` on a real select). Probe/tests were corrected to avoid false PASS.

---

## 2. Migrations applied or pending

### In repository (apply order)

1. `20260317120000_phase1_foundation.sql` — core schema, RLS, storage policies, snapshot immutability, append-only review decisions  
2. `20260317140000_task03_source_document_pipeline.sql` — upload/reprocess columns  
3. `20260317160000_task04_hellodata_conflicts.sql` — conflicts + aliases  
4. `20260317170000_task05_grants_schema_reload.sql` — **new** grants + `NOTIFY pgrst, 'reload schema'`

### Against live project

| Migration | Live status |
|-----------|-------------|
| All of the above | **Pending / not API-visible** |

`npm run task05:migrate` exit **3** — requires `DATABASE_URL`.

### Exact action required

1. Open Supabase Dashboard → project `mqsvrastpdratvzuouxk` → **SQL**.  
2. Run the four migration files **in timestamp order** (or set `DATABASE_URL` and run `npm run task05:migrate`).  
3. **Settings → API → Reload schema** (or rely on Task #5 `NOTIFY`).  
4. Re-run `npm run task05:probe` — expect `status: "schema_ready"` and OpenAPI definitions for `organizations`, etc.

---

## 3. Database and storage verification

### Database / PostgREST
- OpenAPI (`GET /rest/v1/` with secret key): `definitionCount: 0`, no `/organizations`.  
- Real selects: `PGRST205` for all Phase 1 tables.  
- Snapshot immutability / FK / RLS triggers: **not verifiable live** until schema applies (definitions exist in SQL files).

### Storage
- Buckets present and **private**: `source-documents`, `report-photos`, `generated-reports`.  
- Created during this task when initially missing (Storage API).  
- Anonymous/public object URL probe did not return 200.

---

## 4. Authentication verification

| Check | Result |
|-------|--------|
| Auth Admin `listUsers` / `createUser` | Works |
| `signInWithPassword` → access token | Works (JWT) |
| Unauthenticated live API (mocked session missing) | **401** `unauthorized` (unit tests) |
| Demo mode without env | **503** `demo_mode`, no seed fallback (existing tests) |
| App login UI | Added `/login` (existing card/layout language) |
| Settings | Shows live/demo badge + link to `/login` |
| Cookie session → org RLS insert | **Blocked** (no `organizations` table in API) |

Ephemeral test user email pattern: `pkl.task05.<timestamp>@example.com` (credentials stored only in agent store, not the repo). Safe to delete in Auth → Users.

---

## 5. Actual E2E upload results

**Not executed against the database.** Schema blocker prevented:

- Org/property/unit-type/report creation  
- Rentometer CSV/PDF upload persistence  
- HelloData PDF upload persistence  
- Reprocess + review-decision durability checks  

Parsers remain locally verified from Tasks #3–#4 (including real 855 / Veterans files).

---

## 6. Extraction and review persistence

**Live:** blocked.  
**Code paths ready:** `POST /api/uploads`, reprocess, extraction review, conflicts, stats — all auth-gated.

---

## 7. Approved-comp calculation results

**Live:** none.  
Deterministic engine still unit-tested (Task #4). No live curated KPI claim.

---

## 8. RLS / security verification

| Check | Result |
|-------|--------|
| Missing session (live) | PASS (unit) → 401 |
| Demo mode isolation | PASS (unit) → 503, no seed |
| Cross-org helper | PASS (unit) |
| Cross-tenant DB RLS | **BLOCKED** (no tables) |
| Private storage | PARTIAL PASS (buckets private) |
| Invalid uploads | Covered by existing file-validation unit tests |
| Finalized snapshot immutability | SQL trigger present; **live unproven** |

---

## 9. UI workflow results

| Item | Result |
|------|--------|
| Demo UI untouched in structure | Yes |
| `/login` for live session | Added |
| `/upload` HelloData + conflicts (Task #4) | Present |
| Live upload/review against DB | **Blocked** |
| Fake success / seed fallback | Not observed in guarded APIs |

---

## 10. Commands / tests and outputs

| Command | Result |
|---------|--------|
| `npm run task05:probe` | Exit **2** — `schema_missing`, all required tables `PGRST205` |
| `npm run task05:migrate` | Exit **3** — no `DATABASE_URL` |
| `npm test` | **PASS** (62) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** (includes `/login`) |

### Files added/changed this task
- `supabase/migrations/20260317170000_task05_grants_schema_reload.sql`
- `scripts/task05-live-probe.mjs`, `scripts/task05-apply-migrations.mjs`
- `src/app/login/page.tsx`
- `src/app/settings/page.tsx` (mode badge + login link)
- `tests/integration/live-supabase-probe.test.ts`
- `tests/unit/live-auth-guards.test.ts`
- `.env.example`, `README.md`, `package.json` scripts
- `docs/phase1/TASK_05_LIVE_INTEGRATION_REPORT.md`

---

## 11. Exact blockers

1. **Phase 1 SQL is not exposed on PostgREST** for project `mqsvrastpdratvzuouxk` (`PGRST205`, empty OpenAPI).  
2. **No `DATABASE_URL` / DB password** in env → cannot apply migrations non-interactively.  
3. **Supabase Dashboard not signed in** in automation browser → cannot paste SQL without human login.  
4. Therefore **Rentometer / HelloData / conflicts / stats / RLS E2E cannot be claimed PASS**.

---

## 12. Remaining integration issues

- After migrations: confirm OpenAPI lists tables; re-run probe.  
- Prefer legacy JWT anon/service keys **or** confirm `sb_publishable` / `sb_secret` fully supported by `@supabase/ssr` cookie flow in production.  
- Delete ephemeral Task #5 Auth users when finished.  
- Storage RLS path policies from foundation migration still need SQL apply (buckets alone are not enough for org-scoped object auth).

---

## 13. Recommended next coding task

**Unblock live E2E first (ops, ~30–60 min):** apply the four migrations + reload schema, then re-run Task #5 Steps 4–7 (855 Rentometer CSV/PDF + HelloData, one >$25 conflict resolve, draft stats).

**Then next engineering feature:** MLS / listing-source ingestion **or** Claude narrative draft pipeline fed only by approved deterministic KPIs — only after live probe reports `schema_ready`.
