# Task #5A — Safe migration apply procedure

**Stop condition (enforced):** Supabase dashboard labels this branch **`main Production`**.  
Do **not** have an agent auto-apply SQL until a human explicitly authorizes writes on this project (or provides a dedicated non-production branch/project).

## Confirmed diagnosis (2026-11-17)

| Check | Result |
|-------|--------|
| Org | PKL-Management (**Free**) |
| Project | PKL Project (`mqsvrastpdratvzuouxk`) |
| Branch UI label | **main Production** |
| Tables in `public` | **None** (“No tables created yet”) |
| Dashboard Migrations | “Run your first migration” (none applied) |
| PostgREST | Empty OpenAPI + `PGRST205` on app tables |
| Auth / Storage | Working; private buckets already present |

**Root cause:** Phase 1 SQL was **never applied** to Postgres. PGRST205 is not a cache-only false alarm.

## Human authorization gate

Reply with one of:

1. `AUTHORIZE APPLY ON mqsvrastpdratvzuouxk` — allow applying the four migrations on this Free project despite the Production branch label (empty schema; Free tier).  
2. Provide `DATABASE_URL` in `.env` **and** the same authorization phrase.  
3. Point the app at a separate development project / branch and re-run Task #5A.

## Apply order (after authorization)

Run **exactly** these files, in order, via SQL Editor **or** `npm run task05:migrate`:

1. `supabase/migrations/20260317120000_phase1_foundation.sql`  
2. `supabase/migrations/20260317140000_task03_source_document_pipeline.sql`  
3. `supabase/migrations/20260317160000_task04_hellodata_conflicts.sql`  
4. `supabase/migrations/20260317170000_task05_grants_schema_reload.sql`  
5. `supabase/migrations/20260317180000_fix_org_select_rls_for_returning.sql` (required if foundation was applied before the org SELECT fix landed)

Notes:

- Foundation uses non-idempotent `create type` / `create table` — safe on this empty DB; **do not** re-run after success without a forward migration.  
- Storage buckets already exist → foundation `insert … on conflict do nothing` is safe.  
- After apply: Dashboard → Settings → API → **Reload schema** (Task #5 migration also `NOTIFY`s PostgREST).

## Verify

```bash
npm run task05:probe
# expect: "status": "schema_ready"
```

Then continue live E2E: `/login` → org/property/unit type → 855 Rentometer CSV/PDF + HelloData → review → conflict → draft stats.
