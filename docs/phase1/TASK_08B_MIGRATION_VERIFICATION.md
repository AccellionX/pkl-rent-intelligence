# Task #8B — Apply & Verify Weekly Reporting Migration

**Overall status:** **PASS**  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk`  
**Migration:** `20260317200000_task08_weekly_reporting.sql`  
No deploy / commit / push. No additional schema migrations. No `db reset`.

---

## 1. Pre-apply safety checks

| Check | Result |
|-------|--------|
| Linked project ref | **`mqsvrastpdratvzuouxk`** (PKL Project · production) |
| History through `20260317190000` | **PASS** — six prior versions local+remote |
| Pending only `20260317200000` | **PASS** (`db push --dry-run`) |
| SQL additive / non-destructive | **PASS** — nullable alters + `ADD COLUMN IF NOT EXISTS` + comments + `NOTIFY` |
| Unexpected / destructive SQL | **None** — proceed authorized |

### Pre-apply inventory (no PII)

| Metric | Value |
|--------|-------|
| `weekly_metrics` rows | **12** |
| With Zillow jsonb | 12 |
| With Apartments jsonb | 4 |
| With staff notes | 4 |
| With `---agent---` marker | 4 |
| Orgs / properties | 4 / 4 |
| RLS | enabled · policy `weekly_metrics_all` (`*`) |
| Tour columns | `integer NOT NULL DEFAULT 0` (pre-apply) |
| Dedicated feedback/actions/doc FKs | absent (pre-apply) |

---

## 2. Apply

```text
supabase db push --remote --yes
→ Applying migration 20260317200000_task08_weekly_reporting.sql...
→ Finished (only that file)
```

No unrelated migrations. No reset. No ad-hoc SQL during apply.

---

## 3. Post-apply schema & history

| Check | Result |
|-------|--------|
| Remote history includes `20260317200000` | **PASS** |
| Further pending migrations | **None** (dry-run up to date) |
| `tours_scheduled` / `tours_completed` / `applications_received` | **nullable**, no default |
| `feedback_summary`, `actions_planned` | **text nullable** |
| `zillow_document_id`, `apartments_document_id` | **uuid nullable** → `source_documents` |
| RLS policy | unchanged (`weekly_metrics_all`) |

---

## 4. Data preservation

| Metric | Pre | Post (immediate) | After e2e writes |
|--------|-----|------------------|------------------|
| Row count | 12 | **12** | grows with new e2e properties |
| With `---agent---` | 4 | **4** (historical kept) | new writes strip marker |
| Zillow / Apartments jsonb | 12 / 4 | **intact** | intact |
| Dedicated feedback/actions | 0 / 0 | 0 / 0 until new saves | populated by agent POST |

Existing staff notes and platform jsonb were not wiped by the migration.

---

## 5. Application wiring (post-migration)

| Change | Purpose |
|--------|---------|
| `database.types.ts` | Nullable tours/apps + new columns |
| `resolveWeeklyAgent` | Dedicated columns first; historical `---agent---` JSON fallback |
| `POST …/weekly-metrics` | Writes true SQL NULL + `feedback_summary` / `actions_planned`; freeform-only `staff_notes` |
| `persist-weekly.ts` | Sets document FK columns; still preserves agent fields on re-upload |
| GET payload | `storage.*` mirrors dedicated columns; migration note updated |

UI continues to bind through `agent.*` (same shape); values now sourced from dedicated columns on new saves.

---

## 6. Live E2E (`npm run task08:e2e`)

| Check | Result |
|-------|--------|
| Zillow + Apartments uploads (855 real XLSX) | **201** |
| Agent POST dedicated columns | `tours_scheduled=2`, `tours_completed=1`, `applications_received=null`, feedback/actions set, **no** `---agent---` marker |
| GET reload | weekCount 3; apts tours/apps **null**; conversion present |
| Re-upload preserves agent + apartments | **PASS** |
| Dedicated null apps / feedback / actions / tours after re-upload | **PASS** |
| Cross-tenant RLS | `otherSeesWeekly: 0` |
| Privacy scan | **PASS** |
| Overall | **`pass`** (exit 0) |

---

## 7. Quality gates

```text
npm test            → 93 passed (20 files)
npm run typecheck   → pass
npm run lint        → pass
npm run build       → pass
npm run task08:e2e  → pass
```

---

## 8. Unexpected changes

| Area | Observation |
|------|-------------|
| Extra migrations | None |
| Storage buckets / RLS redesign | None |
| Dropped columns / data wipe | None |
| New schema beyond reviewed SQL | None |

---

## 9. Remaining issues / notes

1. Historical rows may still carry `---agent---` JSON in `staff_notes`; reads fall back correctly until those weeks are re-saved (then freeform-only + dedicated columns).
2. Pre-migration `0` placeholders without an agent signal are treated as unavailable (`—`) in the resolver.
3. Optional cleanup (not required for PASS): one-time backfill script to copy historical JSON into dedicated columns — deferred; no extra schema migration.
4. Browser UI login walkthrough still not run (CLI/API-first).
5. Google Geocoding key still absent (unrelated Task #7).

---

## 10. Recommended next task

Claude narrative draft with deterministic KPI injection from approved comps + weekly metrics, **or** optional historical agent JSON → column backfill (data-only, no new migration).

---

## Safety log

| Rule | Honored |
|------|---------|
| Apply only `20260317200000` to `mqsvrastpdratvzuouxk` | Yes |
| No db reset / destructive SQL | Yes |
| No extra schema migrations | Yes |
| No deploy / commit / push | Yes |
| No secret exposure | Yes |
| Stop on unexpected mismatches | N/A — none found |
