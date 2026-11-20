# Task #20B — Customer workflow stability and final local retest

## Final verdicts

| # | Gate | Verdict |
|---|------|---------|
| 1 | Local engineering acceptance | **PASS** |
| 2 | Complete customer journey | **PASS** (Drive folder UX closed in Task #20C) |
| 3 | Photo gallery stability | **PASS** |
| 4 | Report lifecycle stability | **PASS** |
| 5 | Drive status consistency | **PASS** |
| 6 | Full contractual acceptance | **Not claimed** (external dependencies remain) |
| 7 | Production readiness | **Not claimed** (no Vercel deploy; Milestone 1 only) |

**Snapshot recovery required:** No  
**Developer intervention required (API/DB/manual snapshot repair):** No  

Task #20B left the continuous journey PARTIAL solely on Google Drive folder timing (backup blocked until a folder existed). Task #20C closes that customer-journey gap: folder status is visible on the property, staff can finish and download without Drive, warnings appear before completion when backup is unavailable, and folder setup + backup retry work later without regenerating the PDF.

---

## Photo gallery root cause

Observed intermittent “Loading photos…” was not fixed by raising timeouts.

### Root causes

1. **Subject gallery listed every `report_photos` row for the property** (including MLS orphans) before filtering in application memory. After MLS ingest, that meant large payloads and unnecessary work before the subject set was known.
2. **Signed URLs were created sequentially** (`for … await createSignedUrl`). Any accidental inclusion of a large MLS set serialized the request.
3. **Client lifecycle bugs:** `load()` did not abort the previous request; React remounts / refresh could race; a single `loading` flag hid the whole gallery until the list call finished; failed image URLs had no per-tile recovery.

### Fixes implemented

| Area | Change |
|------|--------|
| API | Subject query: `comparable_property_id IS NULL` and `source <> 'mls'` at SQL |
| API | Defense-in-depth `filterPhotosForGallery` after query |
| API | Parallel signed URL generation (`mapWithConcurrency`, concurrency 6, max 48) |
| Client | AbortController + request generation to ignore stale responses |
| Client | Skeleton tiles instead of blocking the whole card; keep prior photos on silent refresh |
| Client | `loading="lazy"` on images; per-image error → “Reload preview” |
| Client | User-facing copy without “signed URL” jargon |

### Actual performance (10 repeated opens / refreshes)

Property under test: `29865d36-…` (Twenty A Journey) with **80 temporary MLS orphan rows** seeded then deleted.

| Metric | Result |
|--------|--------|
| API calls | 10/10 HTTP 200 |
| Photos returned | Always **4** subject photos |
| MLS rows in response | **Never** |
| API p50 | **~1.3 s** |
| API max | **~1.9 s** (first cold) |
| UI “Loading photos…” stuck | **0 / 10** |
| UI max open+refresh | **~11.6 s** (includes full page navigation) |

Evidence: `tmp/task20b/photo-stress.json`, `tmp/task20b/gallery-stress.png`.

---

## Report lifecycle and snapshot integrity

### Fixes

1. **Approve narrative** now calls `approveNarrativeAndLockSnapshot`:
   - Approves narrative
   - Creates immutable snapshot
   - **Rolls approval back to edited** if snapshot lock fails (no false “approved and ready”)
2. **Idempotent approval** keeps the same `approvedAt` / fingerprint so repeat clicks **reuse** the existing snapshot instead of minting duplicates.
3. Snapshot POST returns `reused: true|false`.
4. UI labels: Approve prepares the final PDF; optional “Refresh locked version” only when pricing changed after approval.
5. Mark as completed still follows Phase 1 lifecycle: `in_progress → waiting_on_review → sent` (then Drive).

### Validation on clean property

Fresh property **Twenty B Stable hkirs** (`902a46b2-…`):

- Week 1 + Week 2: Approve → Store final PDF enabled without manual snapshot recovery
- Finalization used the locked snapshot versions produced by Approve
- Historical week 1 remained a separate run/snapshot after week 2

---

## Google Drive status consistency

### Fixes

1. **“Saving to Google Drive…”** shown while backup/poll is in progress
2. Poll after Mark as completed / Save to Drive until `saved_to_drive` or error
3. **Stale-response guard:** a later “Completed”/`sent` payload cannot overwrite a confirmed `saved_to_drive` while idle
4. Retry button remains available when backup fails; final PDF storage is preserved

### Results (Twenty B Stable)

| Report | Drive file | Status |
|--------|------------|--------|
| Week ending 2026-11-07 | [v1 — 0c2356b6](https://drive.google.com/file/d/1gbaUFkKJwWttcUHAgpB46GmafogOtOTU/view?usp=drivesdk) | `saved_to_drive` |
| Week ending 2026-11-14 | [v1 — c2c71baf](https://drive.google.com/file/d/1MPtyt1pe0oGsD72qkjVJSbGFXLsn8Ar2/view?usp=drivesdk) | `saved_to_drive` |

Distinct Drive file IDs; checksum/content identity handled by existing Drive backup naming + content identity helpers. Folder: `Twenty B Stable hkirs (Providence, RI)`.

---

## Clean continuous browser journey

**Property:** Twenty B Stable hkirs · Org PKL Management LLC · User `admin@pkl.com`  
**Script:** `scripts/task20b-clean-customer-journey.mjs` (Playwright UI + `setInputFiles`)  
**No** API finalize bypass, **no** DB edits, **no** server restart, **no** repaired prior snapshots.

| Step | Outcome |
|------|---------|
| Login | Pass |
| Create property / unit type / unit | Pass |
| Upload Rentometer CSV/PDF, HelloData, RI MLS, Zillow, Apartments.com | Pass |
| Extraction identity (marketing + website) | Applied in DB/PDF (`The Residences at Bold Point`, `kettle-point.com`) |
| Accept Rentometer comps / exclude others | Pass (3 eligible groups) |
| Photos upload / crop / reorder | Pass (gallery not stuck; PDFs show Photos: 2 on file) |
| Weekly notes | Pass |
| Claude narrative generate / edit / Approve (locks snapshot) | Pass |
| Store final PDF | Pass both weeks |
| Mark as completed | Pass → status Completed; Drive blocked until folder assigned |
| Drive folder + Save to Google Drive | Completed via UI after continuous pass |
| Week 2 reuse (property, comps, photos, new narrative/PDF) | Pass |
| History / immutability | Separate runs, snapshots, Drive files |

Screenshots: `tmp/task20b/screenshots/`.

---

## Generated PDF paths and page findings

| Week | Local path | Pages | Notes |
|------|------------|-------|-------|
| 1 | `tmp/task20b/pdf/W2026-11-07-v1.pdf` | 3 | Branding, subject, website, recommendation $1,950–$2,150, photos 2 |
| 2 | `tmp/task20b/pdf/W2026-11-14-v1.pdf` | 3 | Same structure; recommendation $1,975–$2,175; distinct period |

Page-level: cover/analysis branding (PKL MANAGEMENT LLC), subject block, listing links, unit table, recommendation, comps/stats narrative sections present. **Not** claimed as 855 reference parity (MLS CMA for 855 and client approvals still outstanding).

---

## Regression tests and suite

Added/extended:

- `tests/unit/photo-list-filter.test.ts` — MLS flood exclusion + concurrency mapper
- `tests/unit/snapshot-approve-idempotency.test.ts` — fingerprint reuse
- `tests/unit/drive-status-guard.test.ts` — stale Drive status guard
- Existing report-status complete-path tests retained

```
npm test       → 220 passed (45 files)
npm run typecheck → pass
npm run lint   → pass
npm run build  → pass
```

---

## Task #20C — Google Drive folder workflow UX closure

**Verdict:** **PASS**  
**Script:** `scripts/task20c-drive-folder-ux.mjs`  
**Evidence:** `tmp/task20c/evidence.json`, `tmp/task20c/screenshots/`

### Product changes

| Area | Behavior |
|------|----------|
| Property workspace | “Google Drive backup” card with clear folder status (`Not set up yet` vs folder name), Create property folder CTA, paste-link option, `#property-drive-folder` deep link |
| PDF workspace | Amber warning when no folder; “Set up backup folder” CTA; copy that finalize/download still work |
| Mark as completed | Confirm warning when backup unavailable; success toast does **not** claim Drive save; status stays Completed (`sent`) until upload succeeds |
| Later backup | Create folder after completion → Save to Google Drive / retry without regenerating PDF |
| Status semantics | Lifecycle unchanged: `in_progress → waiting_on_review → sent → saved_to_drive`; snapshots remain immutable |

### Browser verification

**Configured property** (Twenty B Stable hkirs): folder name shown, access verified, no amber “backup is not set up” warning on reports.

**Unconfigured property** (Twenty C Drive UX `9b0aa493-…`):

| Check | Result |
|-------|--------|
| Property shows Not set up yet + Create property folder | Pass |
| Copy allows finalize/download without Drive | Pass |
| Warning + Set up backup folder before Store | Pass |
| Store final PDF + Mark as completed without folder | Pass → Completed |
| UI did not claim Saved to Google Drive | Pass |
| Create folder later | Pass (`Twenty C Drive UX … (Providence, RI)`) |
| Retry Save to Google Drive without regenerating PDF | Pass → `saved_to_drive` |
| Drive file | [17QX7yOuqdG8Rg1yf1qBbDIHA8PrmhpTx](https://drive.google.com/file/d/17QX7yOuqdG8Rg1yf1qBbDIHA8PrmhpTx/view?usp=drivesdk) |

### Suite after #20C

```
npm test       → 220 passed (45 files)
npm run typecheck → pass
npm run lint   → pass
npm run build  → pass
```

No Vercel deploy, commit, push, or unauthorized migrations.

---

## Remaining external dependencies (deferred)

- Google Geocoding billing (M2/M3)
- Missing 855 RI MLS CMA
- Actual client comparable review decisions
- Veterans authoritative PDF reference
- PKL-owned production Google Drive authorization
- Production / Vercel deployment (not authorized)

These do **not** block local engineering acceptance.

---

## Summary

Local engineering acceptance is **PASS**: photo gallery root cause addressed with measured 10× stability, approve/snapshot atomicity and idempotency, Drive saving/poll/stale guards, and a fresh two-week UI journey that finalized PDFs without developer snapshot recovery. Task #20C closes the remaining Drive folder UX gap—staff see folder status, can complete without backup, are warned when backup is unavailable, and can configure a folder later then retry save without regenerating the PDF. Complete customer journey for this local gate is **PASS**. Full contractual acceptance and production readiness remain **not claimed**.
