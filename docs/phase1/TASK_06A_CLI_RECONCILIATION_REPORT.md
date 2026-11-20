# Task #6A — CLI Configuration & Safe Migration History Reconciliation

**Overall status:** **BLOCKED** (static + PostgREST reconciliation **PARTIAL**; remote history **not** safe to repair yet)  
**Date:** 2026-11-17  
**Target project:** `mqsvrastpdratvzuouxk`  
**No** `db reset`, `db push`, deploy, commit, push, or migration-history repair performed.

---

## Verdict

| Question | Answer |
|----------|--------|
| Is remote migration history safe to repair **right now**? | **No** |
| Why? | CLI personal access token (`sbp_…`) invalid/missing; project **not linked**; no `DATABASE_URL` / DB password; `supabase_migrations.schema_migrations` still absent; full SQL inventory of indexes/constraints/policies/triggers/grants could not be re-verified (Management API returns **401** with current JWT). |
| PostgREST-visible schema vs local migrations? | **Aligned** for all 17 expected tables and all migration-declared columns; org helper RPCs present; private buckets present. |
| Safe next step after credentials? | Link → SQL inventory → if equivalent, obtain **explicit metadata authorization**, then `supabase migration repair --status applied` for verified versions only. |

---

## 1. CLI authentication status

| Check | Result |
|-------|--------|
| Preferred binary | **Homebrew** `/opt/homebrew/bin/supabase` (**3.2.0**) — first on `PATH` |
| npm binary (do not prefer) | `node_modules/supabase/bin/supabase` reports **2.78.1** (stale; avoid mixing) |
| `SUPABASE_ACCESS_TOKEN` in process env | Present but **not** a CLI PAT |
| Token class | `jwt_not_cli` (dashboard/session JWT; starts with `eyJ…`) |
| CLI acceptance | `supabase projects list` → `InvalidAccessTokenError` — must be like `sbp_…` |
| `~/.supabase/access-token` | Absent |
| Token in `.env` | Not stored (correct) |

### Exact instructions — obtain a valid CLI token

1. Open [https://supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) while signed into the account that owns **PKL** / project `mqsvrastpdratvzuouxk`.
2. Create a **Personal Access Token** (prefix `sbp_`).
3. Export **only in the local shell** (do not commit):

```bash
export SUPABASE_ACCESS_TOKEN='sbp_…'   # paste locally; never log/print
hash -r
/opt/homebrew/bin/supabase projects list
```

4. Confirm the list includes `mqsvrastpdratvzuouxk`. If it does not, the token belongs to the wrong Supabase account/org.
5. Optional persistent login: `/opt/homebrew/bin/supabase login --token "$SUPABASE_ACCESS_TOKEN"`.

**Stop condition met for linking:** valid `sbp_` token not available → link / CLI remote history commands were **not** run.

---

## 2. Linked project status

| Check | Result |
|-------|--------|
| `supabase/.temp/project-ref` | **Absent** → **NOT_LINKED** |
| `config.toml` `project_id` | Local name `pkl-rent-intelligence` only (not the cloud ref) |
| Linked to `mqsvrastpdratvzuouxk` | **No** |

### Exact link command (after valid `sbp_` token)

```bash
cd <REPO_ROOT>
export SUPABASE_ACCESS_TOKEN='sbp_…'
/opt/homebrew/bin/supabase link --project-ref mqsvrastpdratvzuouxk
```

Expect a DB password prompt (or `--password` / env). Do **not** proceed without the database password for that project.

---

## 3. Database connectivity

| Check | Result |
|-------|--------|
| `DATABASE_URL` / `SUPABASE_DB_URL` / `DIRECT_URL` / `POSTGRES_URL` | **Missing** (file + process) |
| Local Docker Postgres (`127.0.0.1:54322`) | Not running; `supabase migration list` defaults to local and fails `ECONNREFUSED` |
| App API connectivity (PostgREST + Storage + service role) | **Works** against `https://mqsvrastpdratvzuouxk.supabase.co` |
| Management API `POST …/database/query` with current JWT | **401 Unauthorized** — cannot run live catalog SQL this session |

### Exact instructions — obtain a DB connection string

1. Dashboard → project **`mqsvrastpdratvzuouxk`** → **Project Settings → Database**.
2. Copy the **URI** (Session mode pooler preferred for CLI; or direct `db.<ref>.supabase.co:5432`).
3. Export locally only:

```bash
export DATABASE_URL='postgresql://postgres.[ref]:[PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres'
# or direct:
# export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.mqsvrastpdratvzuouxk.supabase.co:5432/postgres'
```

4. Never print, commit, or paste the URI into chat/logs.

**Stop condition met for CLI DB ops:** no connection string / password → remote `migration list` / `migration repair` / `db` commands against the project were **not** executed.

---

## 4. Migration files inspected (chronological)

| Version | Filename | Role |
|---------|----------|------|
| `20260317120000` | `phase1_foundation.sql` | Extensions, enums, 14 core tables, helpers, triggers, RLS, storage buckets + storage policies |
| `20260317140000` | `task03_source_document_pipeline.sql` | `source_documents` upload/reprocess columns + indexes |
| `20260317160000` | `task04_hellodata_conflicts.sql` | `conflict_status`, `source_value_conflicts`, `property_address_aliases` |
| `20260317170000` | `task05_grants_schema_reload.sql` | Grants + `NOTIFY pgrst` |
| `20260317180000` | `fix_org_select_rls_for_returning.sql` | Task #5A fix: `org_has_any_member` + `organizations_select` |
| `20260317190000` | `task06_mls_geocode_photos.sql` | `mls_number`, `geocode_cache`, photo provenance columns |

Prior apply path (Tasks #5A / #6): Management API `database/query` (manual), **not** CLI history. Therefore table count alone is insufficient proof of full equivalence — matrix below separates **verified live** vs **unverified SQL objects**.

---

## 5. Migration reconciliation matrix

Legend for **Safe action**:

- `HOLD` — do not mark applied until SQL-level check + explicit metadata auth  
- `CANDIDATE_REPAIR` — PostgREST-visible effects match; repair only after full SQL confirm + authorization  
- `FORWARD_MIGRATION` — live gap vs local file (none found at API-visible layer)

| Version / file | Expected objects (summary) | Verified live (PostgREST / Storage / RPC) | Differences | Safe action |
|----------------|----------------------------|-------------------------------------------|-------------|-------------|
| `20260317120000_phase1_foundation.sql` | 9 enums; 14 tables; helpers `set_updated_at`, `is_org_member`, `is_org_admin`, `org_has_any_member`, `handle_organization_created`, immutability helpers; ~14 triggers; ~34 policies (public+storage); 3 private buckets; indexes | All 14 foundation tables in OpenAPI; all parsed columns present; RPCs `is_org_member` / `is_org_admin` / `org_has_any_member` callable; buckets `source-documents`, `report-photos`, `generated-reports` all `public: false`; public object URLs ≠ 200; app data rows present (e.g. orgs 4, extracted_values 54, report_photos 60) | **Unverified without SQL:** exact index/constraint/policy/trigger/grant definitions; storage policy names; enum type catalog | `CANDIDATE_REPAIR` after SQL inventory |
| `20260317140000_task03_source_document_pipeline.sql` | Columns on `source_documents`: `external_report_id`, `content_sha256`, `parser_version`, `warnings`, `summary_metrics`, `superseded_by`, `unit_type_id` + 4 indexes | All 7 columns present in OpenAPI / select probes | Indexes not re-listed via SQL | `CANDIDATE_REPAIR` after SQL inventory |
| `20260317160000_task04_hellodata_conflicts.sql` | Enum `conflict_status`; tables `source_value_conflicts`, `property_address_aliases`; RLS policies; indexes; updated_at trigger | Both tables present; columns match (incl. `alias_normalized`, `field_key`) | Indexes/policies/trigger body unverified via SQL | `CANDIDATE_REPAIR` after SQL inventory |
| `20260317170000_task05_grants_schema_reload.sql` | `GRANT` on schema/tables/sequences; default privileges; `NOTIFY pgrst` | Schema exposed to PostgREST (17 defs); authenticated/service usage implied by live APIs | Exact privilege ACLs not queried | `CANDIDATE_REPAIR` after `information_schema.role_table_grants` check |
| `20260317180000_fix_org_select_rls_for_returning.sql` | Recreate `org_has_any_member`; AFTER INSERT owner trigger; `organizations_select` using `is_org_member OR NOT org_has_any_member` | RPC `org_has_any_member` live; Task #5A E2E previously proved org insert + cross-tenant RLS | **Policy expression text** not re-read this session (Management API 401). Local file embeds Task #5A manual fix | `CANDIDATE_REPAIR` after `pg_policies` / `pg_get_expr` confirm |
| `20260317190000_task06_mls_geocode_photos.sql` | `comparable_properties.mls_number`; table `geocode_cache` (+ RLS/grants/trigger); `report_photos` provenance cols; indexes; `NOTIFY pgrst` | `geocode_cache` present with expected columns (`latitude`/`longitude`, not `lat`/`lng`); `mls_number` present; photo cols `source_document_id`, `sort_order`, `content_sha256`, `width`, `height` present; Task #6 reported apply 201 | Indexes/policies/constraints unverified via SQL | `CANDIDATE_REPAIR` after SQL inventory |

### Aggregate live evidence (not history proof)

| Signal | Value |
|--------|-------|
| OpenAPI public tables | **17** — exact set expected from migrations (no missing, no extras) |
| Column parser: expected vs live | **0** missing expected columns; **0** unexpected tables |
| `supabase_migrations.schema_migrations` | **Does not exist** (prior Task #5A/6 state; not re-queryable this session) |
| CLI migration history | **Unavailable** (not linked; no remote DB) |

---

## 6. Differences requiring forward migrations

**None detected** at the PostgREST-visible table/column layer.

Unverified areas that could still force a **forward** migration (not a blind repair) if SQL inventory finds drift:

1. `organizations_select` policy expression (must still use `org_has_any_member`, not raw `NOT EXISTS` on RLS-filtered `organization_members`).
2. Index / constraint / check definitions (`geocode_cache` lat/lon checks, unique indexes, etc.).
3. Storage RLS policy set on `storage.objects` (names and `bucket_id` predicates).
4. Grant defaults for future tables.

No forward SQL was authored in this task.

---

## 7. Recommended safe repair actions (do **not** run until authorized)

Only after: (a) valid `sbp_` token, (b) `supabase link --project-ref mqsvrastpdratvzuouxk`, (c) DB URL or password, (d) SQL inventory matches matrix, (e) **explicit human authorization** for metadata-only changes:

```bash
# Use Homebrew CLI only
hash -r
/opt/homebrew/bin/supabase --version   # expect 3.2.0

# After link + SQL confirm equivalence:
/opt/homebrew/bin/supabase migration repair --status applied \
  20260317120000 20260317140000 20260317160000 \
  20260317170000 20260317180000 20260317190000 \
  --remote

/opt/homebrew/bin/supabase migration list --remote
```

**Do not:**

- `supabase db reset` / `db push`
- Mark versions applied without SQL equivalence
- Use the npm `2.78.1` binary for repair

Optional pre-repair SQL checks (via CLI `db` / `psql` `$DATABASE_URL`, never logged):

```sql
select to_regclass('supabase_migrations.schema_migrations');
select tablename from pg_tables where schemaname = 'public' order by 1;
select polname, pg_get_expr(polqual, polrelid)
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'organizations';
select id, public from storage.buckets order by id;
```

---

## 8. Existing data / RLS / private buckets (spot checks)

| Check | Result |
|-------|--------|
| Row presence (service role counts) | Data retained (e.g. `organizations` 4, `source_documents` 4, `extracted_values` 54, `report_photos` 60, `review_decisions` 11) |
| Private buckets | All three `public: false` |
| Public URL probe | `400` for missing public objects (not publicly readable) |
| Schema mutations this task | **None** |

---

## 9. Exact remaining blockers

1. **Valid CLI PAT** — replace JWT with `sbp_…` for account that can see `mqsvrastpdratvzuouxk`.
2. **`supabase link --project-ref mqsvrastpdratvzuouxk`** — blocked on (1) + DB password.
3. **`DATABASE_URL` or project DB password** — required for remote migration list/repair and SQL catalog.
4. **Full SQL inventory** — policies, indexes, triggers, constraints, grants (Management API JWT currently **401**).
5. **Explicit authorization** for migration **metadata** repair (history only; no schema push).
6. Prefer Homebrew **3.2.0**; ignore npm **2.78.1**.

---

## 10. Commands run and results

| Command / action | Result |
|------------------|--------|
| `which -a supabase` / `brew list --versions supabase` | Homebrew `3.2.0` on PATH |
| `node_modules/supabase/bin/supabase --version` | `2.78.1` (do not use) |
| `/opt/homebrew/bin/supabase projects list` | `InvalidAccessTokenError` (JWT not `sbp_`) |
| `/opt/homebrew/bin/supabase orgs list` | Same invalid token error |
| Link / `.temp/project-ref` | **NOT_LINKED** |
| `/opt/homebrew/bin/supabase migration list` | Targets local `127.0.0.1:54322` → `ECONNREFUSED` |
| `/opt/homebrew/bin/supabase migration repair --help` | Documented; **not executed** |
| Env key presence probe | App URL/anon/service present; `DATABASE_URL` absent; process token = `jwt_not_cli` |
| PostgREST OpenAPI + column probes | 17 tables; expected columns present |
| RPC probes `is_org_member` / `is_org_admin` / `org_has_any_member` | Callable (return `false` for nil UUID) |
| Storage `listBuckets` + public URL probe | 3 private buckets intact |
| Management API `database/query` | **401** with current JWT |
| `db reset` / `db push` / `migration repair` | **Not run** |

---

## 11. Final status

**BLOCKED**

Remote migration history is **not** safe to repair in this session. PostgREST evidence strongly suggests all six local migrations’ **visible** effects are already on `mqsvrastpdratvzuouxk`, but CLI history metadata must not be written until credentials, link, SQL-level equivalence, and explicit metadata authorization are in place.
