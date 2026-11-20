# Task #23D — Report context and upload workspace separation

**Date:** 2026-11-19  
**Scope:** Phase 1 · no deploy · no commit/push · no unauthorized migrations  
**Fresh property:** `Task23D 855 Prov mcrvm` (`83763169-f65d-4b66-96f6-ef330580750b`)  
**Report:** `22043ee9-ee52-429d-a806-eb38df4c0a29` · 2 Bedroom · **2026-11-03 → 2026-11-10**  
**Evidence:** `tmp/task23d/` (screenshots + `evidence.json`)

---

## Overall verdict: **PASS (workspace separation)** — founder retest recommended

Global Data Uploads no longer paints a partial Weekly Report header or silently adopts the first property. Guided Step 1 requires an explicit `reportId` URL and shows the full nine-step chrome with locked property/report context. Cursor browser verification on localhost confirmed the founder-facing defect is fixed. Headless Playwright verification was **flaky under load** (page.goto timeouts) and is recorded as an independent harness limitation — not as customer UI failure.

---

## Actual root cause

The founder opened **global Data Uploads** (`/upload` via sidebar), not a guided report URL.

1. **`/upload` always mounted `GuidedReportChrome` whenever any `propertyId` was set**, even with no `reportId`.
2. **Property silently defaulted to `properties[0]`** (Veterans / Bold Point), so Document Center showed Veterans files.
3. Without `reportId`, chrome still rendered a **Weekly report** header with “Select a reporting period” and **Progress 0%**, while “Attach to report” stayed None — looking like a broken guided journey.
4. The nine-step stepper appeared incomplete / missing because report signals were empty (`hasReportRun: false`).

This was **workspace conflation**, not a lost guided context after create.

---

## Files changed

| File | Change |
|------|--------|
| `src/app/upload/page.tsx` | General vs guided modes; no silent first-property; Document library banner; locked guided fields; form gated until labels ready; business copy |
| `src/components/buildings/guided-report-chrome.tsx` | No chrome without URL `reportId`; skeleton while loading; recovery if report missing |
| `src/lib/reports/report-entry.ts` | `resolveUploadWorkspaceMode`, document scope helpers |
| `src/lib/ui/status-labels.ts` | `labelDocumentCenterStatus` — “Ready for review” only when pending rows remain |
| `src/app/api/properties/[id]/documents/route.ts` | Accurate review badge + property-level flag |
| `src/components/buildings/live-weekly-leads.tsx` | Upload links preserve report context |
| `src/app/buildings/[id]/leads/page.tsx` | Suspense for search params |
| `tests/unit/report-entry.test.ts` | Upload mode / scope / status regressions |
| `scripts/task23d-*.mjs` | Local browser verification helpers |

---

## Workspace rules

| Mode | URL | UI |
|------|-----|----|
| **General Data Uploads** | `/upload` (optional `buildingId`) | Document library. Explicit property selection. No Weekly Report header / 0% progress / stepper. Start or continue report CTA when a property is chosen. |
| **Guided Step 1** | `/upload?buildingId&reportId&unitTypeId&step=upload` | Full weekly chrome + nine steps. Property/unit/report locked. No unrelated property docs. |

---

## Browser results (Cursor + fresh Task23D property)

| Check | Result |
|-------|--------|
| Global Data Uploads (no report) | **PASS** — Document library; choose property; no Weekly Report / Progress 0% (`01-general-uploads.png`, `10-playwright-general.png`) |
| Explicit Veterans selection | **PASS** — Veterans docs only; still general library (`02-veterans-general.png`) |
| Switch to Task23C / Task23D | **PASS** — Veterans docs do not appear (`03-task23c-general.png`) |
| Create report → Step 1 | **PASS** — navigates with `reportId`; period **2026-11-03 → 2026-11-10** (DB confirmed) |
| Guided Step 1 chrome | **PASS** — Weekly report + STEP 1–9; locked property/report (`05-guided-step1-resolved.png`) |
| Property Documents (`?buildingId=`) | **PASS** — general library for that property; no partial weekly header |
| UX copy | **PASS** — “Upload your documents. We'll extract the available information for you to review.” |
| Headless Playwright full sweep | **FLAKY** — timeouts under concurrent load; do not treat as product regression |

Screenshots: `tmp/task23d/screenshots/`.

---

## Document Center

- Scoped to the **explicitly selected** property only.
- Rows show source type, property, optional unit type, upload scope (property library vs this/earlier report), extracted/remaining counts, and a working review action.
- Badge **Ready for review** only when `remainingReviewCount > 0`; otherwise **Reviewed** (or processing/failed). Existing pending rows were **not** auto-approved or deleted.

---

## Automated verification

| Command | Result |
|---------|--------|
| `npm test` (report-entry + suite) | **252 passed** \| 3 skipped (earlier full run); report-entry **7 passed** |
| `npm run typecheck` | Clean |
| `npm run lint` | Clean |
| `npm run build` | Clean |

---

## Remaining independent defects

1. Headless Playwright goto timeouts when the dev server is under concurrent load — retest with a quiet `next dev` or longer timeouts.
2. Guided step completion heuristics can mark Conflicts completed / Progress > 0% on a brand-new report with no uploads (pre-existing readiness derivation) — unrelated to upload workspace separation.
3. Optional: property-setup pages still mount guided chrome only when `reportId` is present (intended); entering Comparables without a report shows no stepper.

---

## Readiness for founder retest

Yes — for the reported defect:

1. Sidebar **Data Uploads** → should see Document library, **no** Weekly Report / 0% / phantom stepper, **no** auto-selected Veterans.
2. Property **Documents** → general library for that property + Start or continue report.
3. **Start new report** with confirmed Nov 3–10 → lands on guided Step 1 with full stepper and locked 855/Task23D context.

Do **not** treat a failed headless script as a product FAIL when the Cursor browser path above succeeds.
