# Task #8 — Zillow + Apartments.com Weekly Reporting

**Overall status:** **PARTIAL**  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk`  
Live weekly upload/persist/reload/RLS/privacy **PASS**. Forward migration for nullable agent counters prepared but **not applied** (awaiting authorization). Leads UI remains demo-seeded for Veterans (no redesign). No deploy/commit/push.

---

## 1. Implementation status

| Area | Status |
|------|--------|
| Real XLSX inspection (855 + Veterans) | **PASS** |
| Zillow Rental Manager parser | **PASS** |
| Apartments.com leads parser (PII omitted) | **PASS** |
| Property identity / aliases | **PASS** |
| `weekly_metrics` persistence + re-upload merge | **PASS** |
| Deterministic WoW / conversion formulas | **PASS** |
| Agent weekly input API | **PASS** (uses existing integer columns; null≠0 needs migration) |
| Upload source types + review via extractions values | **PASS** |
| Live E2E (`npm run task08:e2e`) | **PASS** |
| Forward migration `20260317200000_…` | **Prepared / not applied** |
| Leads page live wiring | **Deferred** (demo seed retained; API available) |

---

## 2. Changed files

**Parsers / persist / calcs**
- `src/lib/extraction/weekly-types.ts`
- `src/lib/extraction/zillow-xlsx.ts`
- `src/lib/extraction/apartments-xlsx.ts`
- `src/lib/extraction/weekly-property-match.ts`
- `src/lib/extraction/persist-weekly.ts`
- `src/lib/calculations/weekly-metrics.ts`
- `src/lib/extraction/source-types.ts`, `file-validation.ts`, `types.ts`
- `src/domain/database.types.ts` (`weekly_metrics`)

**API / UI**
- `src/app/api/uploads/route.ts`, `uploads/[id]/reprocess/route.ts`
- `src/app/api/properties/[id]/weekly-metrics/route.ts` (GET + agent POST)
- `src/app/upload/page.tsx` (Zillow / Apartments source options)

**Migration / tests / scripts**
- `supabase/migrations/20260317200000_task08_weekly_reporting.sql` (**not applied**)
- `tests/unit/weekly-reporting.test.ts`
- `scripts/task08-weekly-live-e2e.mjs`, `package.json` `task08:e2e`

---

## 3. Real sample file inventory

| ID | Path |
|----|------|
| 855 Zillow | `<LOCAL_CLIENT_SOURCE_DIR>/855 Providence St - 2BR Report Package/3 Source files/Zillow__Listing_performance__1_.xlsx` |
| 855 Apartments | `…/Apartment_com-_855_Providence_St.xlsx` |
| Veterans Zillow | `<LOCAL_CLIENT_SOURCE_DIR>/30 Veterans 1BR report - source files/03 Zillow listing performance 10-22-2026.xlsx` |
| Veterans Apartments | `…/04 Apartments.com report 10-22-2026.xlsx` |

Client samples were **not** committed.

---

## 4. XLSX worksheets and field mappings

### Zillow Listing Performance

| Sheet pattern | Window | Mapping |
|---------------|--------|---------|
| `Month DD, YYYY` titled “Last 7 days as of …” | `last_7_days` | Header row: Property, City, State, Advertising Type, Published Status, Impressions, Listing Views, Listing Web Referrals, Total Leads, Phone Leads, Email Leads, Ad Impressions, Ad Clicks, Days on Market, Spotlight Days |
| `Sheet1` (no last-7 title) | `listing_to_date` | Same columns; cumulative — never treated as weekly |

`week_end` = as-of date; `week_start` = as-of − 6 days. Headers matched **by name** (order-independent).

### Apartments.com Lead Details

| Sheet | Use |
|-------|-----|
| Lead Summary | TOTAL LEADS, Phone Calls, Emails, Tours, Apply Now, Date Range, property table (often header-only) |
| Phone Calls - N | Counts + sanitized events (datetime, duration, status only) |
| Emails - N | Counts + sanitized events (no name/phone/email) |
| Tours / Apply Now | N/A → **null** (not zero) |

**PII columns omitted:** Caller Phone Number, Ring-To Number, Tracking Number, Call Recording, Renter Name, Renter Phone Number, Renter Email.

---

## 5. Extracted metric values (from actual files)

### 855 Zillow — week as of 2026-11-10 (matched `855 Providence St.`)

| Metric | Week | Listing-to-date (Sheet1) |
|--------|------|---------------------------|
| Impressions | **6575** | **37419** |
| Listing views | **237** | **1045** |
| Web referrals | **0** | **0** |
| Total leads | **10** | **28** |
| Phone / email leads | **0 / 10** | **3 / 25** |
| Ad impressions / clicks | **2084 / 82** | **11236 / 334** |

Also extracted weeks as of 2026-11-02 and 2026-10-22 for the same property.

### Veterans Zillow — week as of 2026-10-22

| Metric | Week | To-date |
|--------|------|---------|
| Impressions | **10590** | **47693** |
| Listing views | **252** | **1268** |
| Total leads | **4** | **49** |
| Email leads | **4** | **45** |
| Ad clicks | **63** | **398** |

Matches Veterans seed lead figures for that week.

### 855 Apartments — Date Range 11/3/2026 – 11/10/2026

| Metric | Value |
|--------|-------|
| Total leads | **2** |
| Phone calls | **1** |
| Emails | **1** |
| Tours / Apply Now | **null** (N/A) |

### Veterans Apartments — 10/15/2026 – 10/22/2026

| Metric | Value |
|--------|-------|
| Total leads | **5** |
| Phone calls | **3** |
| Emails | **2** |
| Tours / Apply Now | **null** |

Detail sheets in these exports contain headers only (no renter rows beyond header) — summary counts remain authoritative.

---

## 6. Reporting period handling

- Zillow weekly sheets → `week_end = asOf`, `week_start = asOf − 6`.
- Apartments → explicit `Date Range` start/end.
- Platform merge: Apartments upsert prefers existing `weekly_metrics` row with the **same `week_end`** (so Nov 10 Zillow week starting Nov 4 merges with Apartments 11/3–11/10).
- `unique (property_id, week_start)` prevents double rows for the same Zillow week.
- Re-upload updates the same platform jsonb blob and **does not wipe** the other platform or agent notes.
- Missing N/A metrics stored as **null** inside jsonb (not 0).

---

## 7. Weekly trend formulas

Documented in `WEEKLY_FORMULAS` (`src/lib/calculations/weekly-metrics.ts`):

| Formula | Definition |
|---------|------------|
| WoW absolute | `current − previous`; null if either missing |
| WoW percent | `(current − previous) / previous`; null if previous is 0 or either missing |
| Zillow conversion | `totalLeads / listingViews`; null if views are 0/null |
| Listing-to-date | Compared separately; never confused with weekly |
| Rounding | Ratios to 4 decimal places |

Claude does **not** compute these values.

---

## 8. Agent input workflow

`POST /api/properties/[id]/weekly-metrics` accepts:

- `toursScheduled`, `toursCompleted`, `applicationsReceived`
- `staffNotes`, `prospectFeedbackSummary`, `actionsPlannedNextWeek`

Platform export re-uploads preserve agent fields. Feedback/actions append under a `---agent---` marker in `staff_notes` until dedicated columns are migrated.

---

## 9. Privacy controls

- Apartments detail parsers never map name/phone/email fields into stored JSON.
- Comment text is scrubbed for email/phone patterns.
- API responses include an explicit privacy note.
- Live E2E payload scan for email/phone patterns: **pass**.
- Private `source-documents` bucket for originals.

---

## 10. Supabase E2E results

`npm run task08:e2e` against live project (no new migration apply):

| Check | Result |
|-------|--------|
| Zillow upload 855 | **201** · 3 weekly metric rows + listing-to-date extraction |
| Apartments upload 855 | **201** · phone=1 email=1 tours/apps null · merged onto week_end 2026-11-10 |
| Agent input | **200** · toursScheduled=2 preserved after Zillow re-upload |
| GET weekly metrics + derived conversion | **200** · weekCount 3 |
| Cross-tenant RLS | **pass** (`otherSeesWeekly: 0`) |
| Privacy scan | **pass** |

---

## 11. Test results

```text
npm test       → 89 passed (19 files)
npm run typecheck → pass
npm run lint      → pass
npm run build     → pass
npm run task08:e2e → pass
```

---

## 12. Outstanding blockers

1. **Authorize & apply** `20260317200000_task08_weekly_reporting.sql` for nullable agent counters + `feedback_summary` / `actions_planned` / document FKs (missing ≠ 0 at the column level).  
2. Wire `/buildings/[id]/leads` to live weekly API without redesign (still demo seed).  
3. Apartments workbooks often omit property-name data rows — staff must confirm upload property (warned).  
4. Google Geocoding key still absent (unrelated to weekly metrics).

---

## 13. Recommended next task

1. Authorize Task #8 migration apply on `mqsvrastpdratvzuouxk`, then repair history.  
2. Light live binding of Lead Analytics page to `GET …/weekly-metrics`.  
3. Claude narrative draft with deterministic KPI injection from approved comps + weekly metrics.

---

## Safety log

| Rule | Honored |
|------|---------|
| No scraping / Phase 2 / public links / DOCX | Yes |
| No destructive migrations / db reset / push | Yes |
| No remote migration apply without auth | Yes (file only) |
| No deploy / commit / push | Yes |
| No fabricated extraction | Values from real XLSX |
| No prospect PII in payloads | Yes |
