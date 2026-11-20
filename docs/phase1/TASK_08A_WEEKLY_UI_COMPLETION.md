# Task #8A — Finalize Live Weekly Reporting (UI + API)

**Overall status:** **PARTIAL**  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk`  

Live Leads UI and weekly-metrics API are wired to authenticated Supabase. Demo Veterans experience remains isolated. Migration `20260317200000_task08_weekly_reporting.sql` is inspected and still **not applied** (awaiting separate authorization). No deploy / commit / push.

---

## 1. Verdict summary

| Area | Result |
|------|--------|
| Migration inspect (nullable agent fields only) | **PASS** — forward-only; preserves data/RLS |
| Remote migration history (CLI) | **PASS** — `20260317200000` local-only; remote blank |
| Migration apply | **Not authorized / not applied** |
| Live Leads UI for UUID properties | **PASS** (code + API-backed) |
| Demo Veterans Leads isolation | **PASS** |
| Null ≠ zero display | **PASS** (tables/stat cards use `—`) |
| Weekly vs listing-to-date | **PASS** |
| Agent notes editable + per-week | **PASS** |
| Re-upload preserves agent notes | **PASS** (`task08:e2e`) |
| No prospect PII in payloads | **PASS** |
| Cross-org RLS | **PASS** (`otherSeesWeekly: 0`) |
| Automated tests / lint / typecheck / build | **PASS** |
| Browser UI session walkthrough | **Not run** (CLI/API-first; login required) |

**Why PARTIAL (not PASS):** column-level nullable agent counters + dedicated `feedback_summary` / `actions_planned` / document FK columns remain blocked until `20260317200000` is authorized and applied. App works around this via `---agent---` JSON in `staff_notes`.

---

## 2. Migration inspection

**File:** `supabase/migrations/20260317200000_task08_weekly_reporting.sql`

**Intended changes only:**
- Drop `NOT NULL` + defaults on `tours_scheduled`, `tours_completed`, `applications_received` (missing ≠ 0).
- Add nullable `feedback_summary`, `actions_planned`.
- Add nullable FKs `zillow_document_id`, `apartments_document_id` → `source_documents`.
- `NOTIFY pgrst, 'reload schema'`.

**Does not:** drop tables, rewrite jsonb, change RLS policies, wipe history, or mutate existing metric values.

**CLI history (`supabase migration list --linked` → project `mqsvrastpdratvzuouxk`):**

| Version | Local | Remote |
|---------|-------|--------|
| `20260317120000` … `20260317190000` | present | present |
| `20260317200000` | present | **empty** |

**Apply status:** prepared only. No `db push` / SQL apply performed in this task.

---

## 3. Implementation (Phase 1 only)

### Live vs demo split
- `src/app/buildings/[id]/leads/page.tsx` — `isLiveMode() && UUID` → `LiveWeeklyLeads`; otherwise demo Veterans seed with explicit “Demo sample metrics / Isolated from live Supabase data” badges.
- `PropertyNav` already allows UUID building ids (not only Veterans seed id).

### Live UI
- `src/components/buildings/live-weekly-leads.tsx`
  - Loads `GET /api/properties/[id]` + `GET /api/properties/[id]/weekly-metrics`.
  - Week selector, platform tables (week vs listing-to-date + WoW), Apartments summary with null → `—`.
  - Editable agent form; `POST` saves one week only.
  - Loading / empty / error / save success states reuse existing layout components (no redesign).

### API enrichment
- `src/app/api/properties/[id]/weekly-metrics/route.ts`
  - GET returns camelCase weeks with `zillow`, `apartments`, `agent`, `derived` (conversion, WoW, apartments summary).
  - Agent null semantics via `resolveAgent` + `staff_notes` JSON until migration.
  - DB integer columns still hold `0` placeholders when agent null; **UI/API consumers must use `agent.*`**.
  - POST merges agent fields without touching platform jsonb blobs.
  - Privacy note + migration note in payload.

### Agent notes helper
- `src/lib/weekly/agent-notes.ts` — `splitStaffNotes` / `composeStaffNotes` / `formatNullableMetric`.
- Persist path (`persist-weekly.ts`) updates only the platform jsonb on re-upload; does not clear `staff_notes` or the other platform.

### E2E script
- `scripts/task08-weekly-live-e2e.mjs` updated to assert against enriched GET shape (not raw DB column names).

---

## 4. Live API verification (`npm run task08:e2e`)

Against real 855 Providence XLSX files and authenticated live project:

| Check | Result |
|-------|--------|
| Zillow upload | **201** — 3 weekly metric rows |
| Apartments upload | **201** — phone=1, email=1, tours/apps **null** |
| Agent POST | **200** |
| GET reload | **200** — weekCount 3; Nov 4–10 has Zillow + Apts; `aptsTours`/`aptsApps` null |
| Agent after Zillow re-upload | **preserved** (`toursScheduled: 2`, comments contain `task08`, apartments still present) |
| Cross-tenant RLS | **pass** |
| Privacy scan | **pass** |
| Overall e2e status | **`pass`** (exit 0) |

Sample GET week (2026-11-04 → 2026-11-10): `hasZillow: true`, `hasApts: true`, `toursScheduled: 2`, `agentProvided: true`, `aptsTours: null`, `aptsApps: null`, conversion ≈ 0.0422.

---

## 5. Reference value regression (from Task #8 parsers / e2e)

Verified against local client workbooks (not committed):

| Source | Expected | Observed |
|--------|----------|----------|
| 855 Zillow as of 11/10 | 6575 impressions, 237 views, 10 leads, 28 to-date | Match (Task #8 extract + live persist) |
| Veterans Zillow as of 10/22 | 10590 / 252 / 4 | Match (parser regression) |
| 855 Apartments 11/3–11/10 | 1 phone, 1 email, tours/apps missing | Match in e2e summary |
| Veterans Apartments 10/15–10/22 | 3 phones, 2 emails, 5 combined | Match (Task #8 extract) |

---

## 6. Test / quality gates

```text
npm test            → 91 passed (20 files)   [was 89 in Task #8]
npm run typecheck   → pass
npm run lint        → pass
npm run build       → pass
npm run task08:e2e  → pass
```

New/updated unit coverage includes `tests/unit/weekly-agent-notes.test.ts`.

---

## 7. Functionality vs migration blocker

| Capability | Works today without migration? |
|------------|--------------------------------|
| Upload/persist Zillow + Apartments | Yes |
| Live Leads for UUID properties | Yes |
| Week/platform/agent display | Yes |
| Null tours/apps as unavailable | Yes (jsonb + agent JSON + UI `—`) |
| Preserve agent notes on re-upload | Yes |
| Org isolation / no PII in GET | Yes |
| True SQL NULL on tour/app integer columns | **No — blocked** |
| Dedicated `feedback_summary` / `actions_planned` columns | **No — blocked** (stored in notes JSON) |
| Document FK columns on `weekly_metrics` | **No — blocked** (`sourceDocumentId` remains inside jsonb) |

---

## 8. Outstanding blockers

1. **Authorize apply** of `20260317200000_task08_weekly_reporting.sql` on `mqsvrastpdratvzuouxk`, then reconcile history (do not blind re-apply prior migrations).
2. After apply: stop writing `0` placeholders for unset agent counters; optionally migrate `---agent---` JSON into columns.
3. Optional authenticated browser pass on `/buildings/{uuid}/leads` (not done here).
4. Unrelated: Google Geocoding key still absent (Task #7).

---

## 9. Recommended next task

1. **Explicit authorization** → apply Task #8/`#8A` migration only; verify nullable columns + PostgREST reload.  
2. Or proceed to **Claude narrative draft** with deterministic KPI injection from approved comps + weekly metrics (Phase 1), keeping live Leads as-is.  
3. Light post-migration cleanup of agent storage path once columns exist.

---

## 10. Safety log

| Rule | Honored |
|------|---------|
| Phase 1 only / no redesign / no scraping | Yes |
| CLI/API-first | Yes |
| No destructive DB ops / no reset | Yes |
| No migration apply without authorization | Yes |
| No deploy / commit / push | Yes |
| No fabricated success | Yes — PARTIAL with migration callout |
| No prospect PII in client report payloads | Yes |
