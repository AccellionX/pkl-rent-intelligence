# Task #23C — Guided workflow entry and navigation stability

**Date:** 2026-11-19  
**Scope:** Phase 1 · no deploy · no commit/push · no unauthorized migrations  
**Fresh property:** `Task23C 855 Prov lliyy` (`3a8f2e1b-c0c4-4e97-9175-e12d5ded5ee1`)  
**Report:** `72ea99c1-8938-4ee4-86bd-976b7316a80e` · 2 Bedroom · **2026-11-03 → 2026-11-10**  
**Evidence:** `tmp/task23c/` (`evidence.json`, screenshots)

---

## Overall verdict: **PASS (guided entry / navigation)**

A completely new property consistently enters the guided journey without showing the legacy PDF download workspace first. Creating a report navigates immediately to guided Step 1 (Upload) with `reportId`, `unitTypeId`, and confirmed period dates. Task #23B guided UX acceptance is restored for the entry/flicker defect.

Full end-to-end final PDF on this fresh property (client comparable approvals) was **not** forced — that remains covered by 23B readiness/finalization protections and is intentionally limited here (no auto-approval of client comps).

---

## Actual root cause

1. **`LivePdfReports` always painted the Download / draft PDF surface** whenever any report existed (`showStartReport` defaulted false; `reportId` silently became `list[0]`).
2. **`createReport()` stayed on `/reports`** and never wrote guided URL params or redirected to Step 1.
3. **`GuidedReportChrome` used `Suspense fallback={null}`** and ignored its own `loading` flag, so the legacy body appeared first and the stepper popped in later.
4. **`useGuidedReport` treated API auto-picked “latest report” as active** even when the URL had no `reportId`, which desynced chrome from the page.
5. **Period defaults used `toISOString()` (UTC)**, which could shift dates vs local calendar intent.

---

## Files changed

| File | Change |
|------|--------|
| `src/components/buildings/live-pdf-reports.tsx` | Hub vs download modes; create → Step 1 navigate; URL is source of truth; local suggested dates |
| `src/components/buildings/guided-report-chrome.tsx` | Loading skeleton; no null Suspense fallback |
| `src/hooks/use-guided-report.ts` | No silent report adoption without URL `reportId`; clear prior chrome while loading |
| `src/lib/reports/report-entry.ts` | Period helpers + workspace mode classification |
| `src/lib/pdf/jspdf-renderer.ts` | Empty comparable chart explanation (no subject-only fake chart) |
| `src/components/live/live-building-detail.tsx` | “Open report workspace” wording |
| `src/components/live/live-property-drive.tsx` | Lint-safe expand-on-hash |
| `tests/unit/report-entry.test.ts` | Entry / date / href regressions |
| `tests/unit/pdf-rent-chart.test.ts` | Empty chart copy regression |

---

## Application states (A / B / C)

| State | UI |
|-------|----|
| **A — No active report** | Report workspace hub + Start form. No download/finalize controls. |
| **B — Active draft(s)** | Continue report list (explicit pick). No silent switching. Create another available. |
| **C — Finalized** | Completed reports → “Open download” with `step=download`. Drafts unchanged. |

Download / Generate final PDF appear **only** when URL includes `reportId` **and** `step=download|preview`.

---

## Browser results (fresh property)

| Check | Result |
|-------|--------|
| Hub after Start/continue | **PASS** — `Weekly report` title; Report workspace; Create Step 1; **no** Download and save / Generate final / Branded PDF (`05-hub.png`) |
| Confirm dates Nov 3–10 | **PASS** (`06-dates.png`, DB `period_start/end`) |
| Create → immediate Step 1 | **PASS** — `/upload?...&reportId=…&step=upload` (`07-step1.png`); stepper present; no legacy download |
| Loading flicker to legacy PDF | **PASS** — not observed on hub or Step 1 |
| Save/exit → hub draft | **PASS** (`08-hub-draft.png`) |
| Continue correct report | **PASS** — same `reportId` (`09-resume.png`) |
| Refresh preserves context | **PASS** (`10-refresh.png`) |
| Logout / login resume | **PASS** (`11-relogin-hub.png`, `12-relogin-resume.png`) |
| Explicit download step | **PASS** — guided header + Preview incomplete draft PDF (`13-download-step.png`) |
| Comparables / pricing context | **PASS** (`14-step-comparables.png`, `14-step-pricing.png`) |

Screenshots: `tmp/task23c/screenshots/`.

---

## Date-selection result

Staff must confirm period fields before create. Suggested window uses **local** calendar dates (`suggestedReportingPeriod`). Fresh report stored as **2026-11-03 → 2026-11-10** (not the prior silent Nov 12–19 default).

---

## Empty / incomplete draft chart

When no approved comparable rents exist, PDF renders an explanation that the comparison chart appears after comparable review — it does **not** present a subject-only bar as a market chart (`tests/unit/pdf-rent-chart.test.ts`).

---

## Automated verification

```
npm test        → 249 passed | 3 skipped (252) · 54 files
npm run typecheck → clean
npm run lint      → clean
npm run build     → clean
```

**3 skips:** optional local Rentometer fixture files absent (same as 23B; not acceptance skips).

---

## Remaining independent defects / limits

- Full nine-step **final PDF** on this fresh 855 property (with authorized comparable approvals) not re-run end-to-end in 23C — navigation/entry was the regression under test; finalization rules unchanged from 23B.
- Unit “Add unit” embedded form still requires the unit-type card’s Add unit control after types exist (UI timing in automation); property setup path itself works.
- Geocoding billing / production credentials remain deferred to M2/M3.
- Founder historical draft PDF attached to the bug report remains valid evidence of the **pre-fix** incomplete draft behavior.

---

## Readiness for founder retest

**Yes.** Retest path:

1. Create a new property (or use `Task23C 855 Prov lliyy`).
2. Open **Start / continue report**.
3. Confirm unit type + **Nov 3–10** (or intended week) → **Create report and open Step 1**.
4. Confirm you land on Upload with the guided stepper and **never** see Download/Generate final first.
5. Exit and **Continue report** from the hub; refresh; re-login.

Do not declare product-wide Phase 1 complete solely from 23C — this closes the guided **entry/navigation** regression that reopened 23B UX acceptance.
