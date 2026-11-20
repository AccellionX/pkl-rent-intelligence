# Task #5A — Migration Recovery & Live E2E Validation

**Overall status:** **PASS** (conflict resolve **PARTIAL** — no pending >$25 rows after sample accepts)  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk` · org **PKL-Management Free** · UI name **PKL Project**  
**Branch label in dashboard:** **`main Production`**  
**Authorization:** `AUTHORIZE APPLY ON mqsvrastpdratvzuouxk`

No deploy, commit, or push. Secrets/connection strings were not printed.

---

## Scorecard

| Area | Status | Notes |
|------|--------|-------|
| Migrations applied | **PASS** | Five SQL files applied via Management API `database/query` |
| Schema exposure (PostgREST) | **PASS** | `npm run task05:probe` → `schema_ready`; 16 tables; OpenAPI exposes orgs |
| Authenticated APIs (cookie→DB) | **PASS** | Property / unit-type / report / upload / review / stats over session cookies |
| RLS (live multi-tenant) | **PASS** | Second authenticated user sees `0` rows for member org |
| Private storage | **PASS** | Buckets private; public object probe ≠ 200; live uploads to `source-documents` |
| Rentometer E2E | **PASS** | Real 855 CSV → 23 extractions, `needs_review`, storage path written |
| HelloData E2E | **PASS** | Real 855 PDF → 21 extractions, `needs_review` |
| Conflict decisions | **PARTIAL** | List API OK; `0` pending after accepting 5+5 extractions; resolve skipped |
| Approved statistics | **PASS** | Draft KPIs: blended avg rent **1903**, PSF **2.26**, range **1480–2120** |
| Local regression | **PASS** | `npm test` 62/62; typecheck; lint; build |

---

## 1. Root cause of PGRST205 (resolved)

Phase 1 tables were **absent** from Postgres `public` (never migrated). Empty OpenAPI + real `PGRST205` were correct; `head:true` had been a false pass earlier.

---

## 2. Migration list and applied status

| File | Purpose | Live status |
|------|---------|-------------|
| `20260317120000_phase1_foundation.sql` | Enums, tables, RLS, storage, triggers | **Applied** (201) |
| `20260317140000_task03_source_document_pipeline.sql` | Upload/reprocess columns | **Applied** (201) |
| `20260317160000_task04_hellodata_conflicts.sql` | Conflicts + aliases | **Applied** (201) |
| `20260317170000_task05_grants_schema_reload.sql` | Grants + `NOTIFY pgrst` | **Applied** (201) |
| `20260317180000_fix_org_select_rls_for_returning.sql` | Org SELECT + `org_has_any_member` for PostgREST RETURNING | **Applied** (201) |

**Apply path:** Supabase Management API `POST /v1/projects/mqsvrastpdratvzuouxk/database/query` with dashboard bearer (no `DATABASE_URL`).

**Foundation fix during apply:** SQL-language helpers `is_org_member` / `is_org_admin` must be created **after** `organization_members` (Postgres validates SQL function bodies at create time). Migration file reordered accordingly before successful apply.

---

## 3. Schema verification

16 `public` tables present including `organizations`, `source_documents`, `source_value_conflicts`, `report_runs`, etc.  
`NOTIFY pgrst, 'reload schema'` issued after apply.

---

## 4. PostgREST verification

```text
npm run task05:probe  →  status: "schema_ready" (exit 0)
```

OpenAPI: definitionCount 16, `exposesOrganizations: true`. All probed tables HTTP 200.

---

## 5. Real authentication / RLS results

| Check | Result |
|-------|--------|
| Password sign-in (ephemeral Task #5 user) | Works |
| Org insert + owner trigger | Works after SELECT policy fix |
| Cross-tenant: other user `select` org by id | **0 rows** (`rls.pass: true`) |
| Cookie session → Next `/api/properties` etc. | 201/200 |

**RLS lesson:** A raw `NOT EXISTS (SELECT … FROM organization_members)` inside `organizations_select` is itself RLS-filtered and **leaked all orgs** to non-members. Fixed with security-definer `org_has_any_member(uuid)`.

---

## 6. Real-file E2E results

Harness: `scripts/task05-live-e2e.mjs` against `npm run dev` (live mode).

| Step | Result |
|------|--------|
| 855 Rentometer CSV | 201; document `df28411c-…`; **23** extractions |
| 855 HelloData PDF | 201; document `96fcf836-…`; **21** extractions |
| Reviews | 10/10 accepts (200) |
| Conflicts pending | **0** → resolve **not exercised** |
| Draft stats | 200; approvedCount 5; blendedAverageRent 1903 |

---

## 7. Storage verification

| Bucket | Public? | Live upload |
|--------|---------|-------------|
| `source-documents` | **false** | Yes (CSV + PDF paths under org/property) |
| `report-photos` | **false** | (not used this run) |
| `generated-reports` | **false** | (not used this run) |

---

## 8. Conflict and approved-stat calculations

**Live conflicts:** API list works; no pending rows from this accept sample — mark **PARTIAL** (do not claim >$25 resolve PASS).  
**Live draft stats:** exercised; deterministic KPI fields returned; snapshots noted immutable.

---

## 9. Commands and test results

| Command | Result |
|---------|--------|
| Management API apply (5 files) | 201 each |
| `npm run task05:probe` | `schema_ready` |
| `node scripts/task05-live-e2e.mjs` | `status: "pass"` |
| `npm test` | 62 passed |
| `npm run typecheck` / `lint` / `build` | OK |

---

## 10. Remaining blockers / follow-ups

1. **Conflict resolve path** — still needs a live case with a real pending >$25 `source_value_conflicts` row (accept more matched dual-source comps or seed a conflict).  
2. No `DATABASE_URL` — CLI `task05:migrate` still unused; Management API / SQL Editor remain the apply paths.  
3. Ephemeral Auth user `pkl.task05.*@example.com` — safe to delete after validation.  
4. Foundation file was edited **after** first failed attempt (helper order + org SELECT helper); greenfield applies should use current files including `20260317180000_…`.

---

## 11. Recommended next task

1. Drive one live >$25 HelloData↔Rentometer conflict through `/api/conflicts/[id]/resolve`.  
2. Feature work: MLS ingestion **or** Claude narrative with deterministic KPI injection on approved comps.

---

## Safety decision log

| Question | Answer |
|----------|--------|
| Authorization received? | **Yes** — `AUTHORIZE APPLY ON mqsvrastpdratvzuouxk` |
| Agent applied SQL? | **Yes** — authorized project only |
| Production branch label? | Yes — writes only after explicit authorize |
| Free tier / empty schema at start? | Yes |
