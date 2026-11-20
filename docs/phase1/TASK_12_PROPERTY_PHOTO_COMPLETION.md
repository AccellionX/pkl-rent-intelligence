# Task #12 — Property, Subject Unit & Photo Completion

**Overall status:** **PASS** (API/live E2E) with **PARTIAL** browser login automation (unchanged Task #11 limitation)  
**Date:** 2026-11-18  
**Project:** `mqsvrastpdratvzuouxk`  

Phase 1 property intake, subject-unit CRUD, private photo crop/reuse, org selection, and report assembly wiring are complete. No scraping, no public storage URLs, no DOCX, no maps, no migrations applied, no commit/push/deploy.

---

## Axis / verdict

| Area | Result |
|------|--------|
| Organization selection (explicit + persistent) | **PASS** |
| Property facts edit (name, address, amenities, links, notes) | **PASS** |
| Subject units CRUD + incomplete flags | **PASS** |
| Photo upload / paste / 3:2 crop / reorder / replace / remove / reuse | **PASS** |
| Tenant authorization (cross-org denied) | **PASS** |
| Report assembly + PDF preview uses real units/photos + crop metadata | **PASS** |
| Unit tests / typecheck / lint / build | **PASS** |
| Browser controlled-input login automation | **PARTIAL** (manual login still required when automation cannot fill React inputs) |

---

## Files changed (high level)

### APIs
- `src/app/api/me/route.ts` — org list + `propertyCount` + `suggestedOrganizationId`
- `src/app/api/properties/[id]/units/route.ts` — list/create subject units
- `src/app/api/units/[id]/route.ts` — get/patch/delete subject unit
- `src/app/api/photos/[id]/route.ts` — get (signed URL) / patch crop|sort / delete
- `src/app/api/properties/[id]/photos/route.ts` — list returns short-lived signed URLs
- `src/app/api/properties/[id]/photos/reuse/route.ts` — prior-week reuse (copies bytes + crop)
- `src/app/api/reports/[id]/pdf/route.ts` + `.../finalize/route.ts` — load private photo bytes for render

### Domain / libs
- `src/domain/schemas.ts` — subject unit + photo crop schemas
- `src/lib/photos/crop.ts`, `src/lib/photos/load-for-pdf.ts`
- `src/lib/reports/assemble.ts` / `types.ts` — photo records + incomplete units + warnings
- `src/lib/pdf/html-template.ts`, `jspdf-renderer.ts`, `finalization.ts`, `render.ts`
- `src/lib/privacy/client-report-payload.ts` — ignore storage-path false phone positives

### UI
- `src/hooks/use-live-org.ts` — persistent org; suggested non-empty portfolio fallback
- `src/components/live/live-org-switcher.tsx`
- `src/components/live/live-auth-gate.tsx` — org switcher bar
- `src/components/live/live-subject-units.tsx`
- `src/components/live/live-photo-manager.tsx`
- `src/components/live/live-building-detail.tsx` — stories, notes, units, photos

### Tests / scripts / docs
- `tests/unit/schemas.test.ts`, `photo-crop.test.ts`, `org-selection.test.ts`, `calculations-privacy.test.ts`
- `scripts/task12-property-photo-e2e.mjs`
- `docs/phase1/TASK_12_PROPERTY_PHOTO_COMPLETION.md` (this file)

---

## Working UI controls

On **Properties → property detail** (`/buildings/[id]`):

1. **Active organization** switcher (via `LiveAuthGate`) — persisted in `localStorage` key `pkl-live-organization-id`; warns when selected org has 0 properties.
2. **Property details** — name, marketing name, address, city/state/postal, year built, unit count, stories, amenities, Zillow/Apartments.com listing links, property notes (`external_links.propertyNotes`).
3. **Unit types** — existing add flow preserved.
4. **Available units** — add/edit/remove with confirmation; fields: unit number, unit type (beds/baths from type), sqft, asking rent, status, available date, notes; incomplete rows flagged “Needs review”; listing links shown for manual verification only.
5. **Subject photos** — upload, clipboard paste, 3:2 crop with preview + saved coordinates, reorder, replace, remove, reuse for subsequent week; missing-photo placeholder; signed preview URLs only.

---

## Database / API behavior

- Existing tables reused: `properties`, `unit_types`, `subject_units`, `report_photos`, private bucket `report-photos`.
- Every property/unit/photo route uses `requireAuth` + `requirePropertyAccess` / `requireOrgMembership`.
- Cross-tenant callers receive **404** (existence not leaked).
- Weekly uploads do **not** delete `subject_units` (no delete path outside explicit unit DELETE).
- Photo reuse cannot share `storage_path` (unique constraint `report_photos_storage_bucket_storage_path_key`) — reuse **copies** bytes to a new private path and copies `crop_metadata`, `source=prior_week`.
- Property notes stored in `external_links.propertyNotes` (passthrough) to avoid unapproved migrations.
- **No migrations applied.** No destructive schema changes.

---

## Photo crop and reuse behavior

- Crop metadata shape: `{ aspect: "3:2", x, y, width, height }` fractions of source image.
- Saved on upload (optional) and via `PATCH /api/photos/[id]`.
- HTML/Playwright PDF applies crop via overflow frame; jsPDF embeds real subject image data URLs when available (no demo art).
- List/GET return **signed** URLs (~10 minutes); never public bucket URLs.
- Placeholders: “Photo to be added” when no subject photos.

---

## Report integration

- `assembleReportPayload` loads available subject units for the report’s unit type (with `incomplete` + `availableDate`) and all property photo records with crop.
- Finalization warnings include missing/incomplete units and missing subject photos.
- Draft/final PDF routes download private photos and pass `photoDataUrls` into renderers.
- Final PDF still uses **immutable snapshot** payload; older snapshots without `photos[]` are coalesced from `photoPaths` at render time only (in-memory).
- Mandatory blockers (comps/narrative/rent range) unchanged — never auto-approve comps.

---

## Browser and E2E verification

### Live E2E (`node scripts/task12-property-photo-e2e.mjs`) — **PASS**

Evidence (2026-11-18):

| Step | Result |
|------|--------|
| `/api/me` org counts + suggested org | ok; suggested org with properties |
| Subject unit create/patch/list | ok; askingRent persisted `2010` |
| Photo upload (no publicUrl) | ok |
| Crop PATCH + signed list URL | ok; cropSaved |
| Photo reuse | ok (new row id) |
| Property facts PATCH | ok |
| Report assemble | ok; `subjectPhotoCount: 5` |
| Cross-tenant units/photos | **404** denied |
| Org switch empty vs primary list | listsDiffer `true` (0 vs 1) |
| Unit delete | ok |

### Browser

- Dev server live mode confirmed (`/api/health` → `mode: live`).
- Controlled React login via automation remains flaky (Task #11); use manual sign-in then org switcher + property detail for visual confirmation.

---

## Tests

| Command | Result |
|---------|--------|
| `npm test` | **117 passed** (25 files) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** (routes include `/api/units/[id]`, `/api/photos/[id]`, `/photos/reuse`) |

New coverage: subject-unit/photo schemas, 3:2 crop helpers, org selection rules, storage-path PII false-positive guard.

---

## Blockers

1. **Staff comps approval** still required for final PDF (Task #10A) — not in scope to auto-approve.
2. **Browser login automation** still unreliable for React controlled inputs — manual login OK.
3. **Schema note:** `report_photos` unique `(storage_bucket, storage_path)` forces reuse-by-copy (not shared path). A future authorized migration could allow shared paths if desired.
4. Property notes live in `external_links.propertyNotes` until an authorized `properties.notes` column migration is approved.

---

## Recommended next task

**Task #13 candidate:** Finalization UX polish — surface mandatory blockers/warnings on the property PDF workspace before finalize; optional staff flow to attach reused photos to a specific `report_run_id`; decide whether to authorize a `properties.notes` column migration vs keep `external_links.propertyNotes`.

---

## Strict compliance checklist

- [x] Phase 1 only  
- [x] Preserve current design language  
- [x] No Zillow/Apartments scraping  
- [x] No public file URLs  
- [x] No DOCX export  
- [x] No report maps  
- [x] No destructive schema changes / no unapproved migrations applied  
- [x] No deployment / commit / push  
- [x] No fake data or fake success states  
