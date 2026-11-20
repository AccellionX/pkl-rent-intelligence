# Task #6B — Metadata-Only Migration History Repair

**Overall status:** **PASS**  
**Date:** 2026-11-17  
**Target project:** `mqsvrastpdratvzuouxk` (PKL Project · production)  
**Authorization:** metadata-only migration history reconciliation for the six verified versions  
**Scope:** CLI history metadata only — no application SQL re-apply, no `db push` / `db reset` / `db pull`, no deploy, commit, or push.

---

## Exact six migration versions

| Version | Filename |
|---------|----------|
| `20260317120000` | `phase1_foundation.sql` |
| `20260317140000` | `task03_source_document_pipeline.sql` |
| `20260317160000` | `task04_hellodata_conflicts.sql` |
| `20260317170000` | `task05_grants_schema_reload.sql` |
| `20260317180000` | `fix_org_select_rls_for_returning.sql` |
| `20260317190000` | `task06_mls_geocode_photos.sql` |

---

## Pre-repair checks

| Check | Result |
|-------|--------|
| Homebrew CLI | `/opt/homebrew/bin/supabase` **3.2.0** |
| Linked project ref | **`mqsvrastpdratvzuouxk`** |
| CLI auth | `sbp_` PAT loaded from `.env` (not logged) |
| Pre-repair `migration list --remote` | All 6 local present; **remote blank** for each |
| `supabase_migrations.schema_migrations` | Did **not** exist (no unexpected history rows) |
| Tables / enums / functions / triggers / policies | **1:1 match** vs local migrations |
| Named indexes | All migration-named indexes present (extra live `*_key` = UNIQUE constraint indexes only) |
| Task #5A org SELECT | `is_org_member(id) OR (NOT org_has_any_member(id))` |
| Key columns (Task #3/#4/#6) | Present (`mls_number`, `geocode_cache`, photo provenance, source_documents pipeline cols) |
| Storage buckets | `source-documents`, `report-photos`, `generated-reports` — all **private** |
| OpenAPI public defs | **17** |
| Mismatches | **None** → proceed authorized |

---

## Repair commands executed

```bash
/opt/homebrew/bin/supabase migration repair --status applied \
  20260317120000 20260317140000 20260317160000 \
  20260317170000 20260317180000 20260317190000 \
  --remote --yes
```

**CLI result:**

```text
Confirmed by --yes: Mark 6 migrations as applied on project PKL Project (mqsvrastpdratvzuouxk) · production
Repaired migration history: [20260317120000 … 20260317190000] => applied
status: applied
repair_exit=0
```

No application migration SQL executed. No schema DDL proposed beyond history metadata.

---

## Post-repair migration list

`supabase migration list --remote`:

| Local | Remote |
|-------|--------|
| `20260317120000` | `20260317120000` |
| `20260317140000` | `20260317140000` |
| `20260317160000` | `20260317160000` |
| `20260317170000` | `20260317170000` |
| `20260317180000` | `20260317180000` |
| `20260317190000` | `20260317190000` |

SQL history table now contains the same six `version` rows only.

---

## Schema and storage verification

| Check | Result |
|-------|--------|
| `npm run task05:probe` | **`schema_ready`** (exit 0) |
| Public table count | **17** |
| OpenAPI definition count | **17** |
| Buckets | 3 private (`public: false`) |
| Public storage probe | **400** (not publicly readable) |

---

## Regression test results

| Command | Result |
|---------|--------|
| `npm test` | **78/78** passed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |

---

## Remaining issues

None for history reconciliation. Future schema changes should use normal CLI migrations against this reconciled history (still require explicit authorization before production apply).

---

## Safety log

| Action | Done? |
|--------|-------|
| Metadata-only `migration repair --status applied` | Yes |
| `db push` / `db reset` / `db pull` | **No** |
| Re-execute migration SQL files | **No** |
| Alter app tables/policies/data/buckets | **No** |
| Deploy / commit / push | **No** |
| Secrets printed | **No** |
