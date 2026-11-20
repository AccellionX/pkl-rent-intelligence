# Task #23 / #23A / #23B — Guided UX and final report acceptance closure

**Dates:** 2026-11-19 (Task #23) · 2026-11-19 (Task #23A) · 2026-11-19 (Task #23B)  
**Scope:** Phase 1 only · no deploy · no commit/push · no unauthorized migrations  
**Isolated property:** `Task23A Veterans dnvlh` (`5602ec8a-006f-464d-9734-0b113e18e4b6`)  
**Drive folder:** `Task23A Veterans dnvlh (East Providence, RI)` · id `1r5xbZxJAvPXocTlKwPF2LTov_iiJoy-u`  
**Evidence:** `tmp/task23a/` (23A) · `tmp/task23b/` (23B screenshots + PDFs)

### Report runs used in 23B

| Report | Id | Period | Status | Drive file id |
|--------|-----|--------|--------|---------------|
| Week1 | `82ac4c7f-…` | 2026-11-12→19 | saved_to_drive | `11u7fQErr3OpZx8rbEFYTo_oP3Sv8lv1l` |
| Week2 | `54627b9f-…` | 2026-11-19→26 | saved_to_drive | `1IPliys0IlRR5FieG1bJhx0ayzIWntMci` |
| Week3 (market DOM + chart) | `dba23606-…` | 2026-11-26→12-03 | saved_to_drive | `1FgGPtBo3zO7sYqZxA9uTmfVPkV5J8rAK` |
| Week4 (photo versioning) | `abf1dbfd-…` | 2026-12-03→12-10 | saved_to_drive | v2 `1WuLcYbLQ9TPRin-4947WFCstqiDKj5Qw` |

---

## Overall 23B verdict: **PASS with documented residuals**

23B closed the Task23A contradictions: shared readiness, Review later controls, market DOM 48 in finalized PDF, rent-range chart + methodology, Drive folder + multi-version backups, and immutable snapshot versioning. Historical client DOCX/855 parity remains a content-completeness judgment (not a forced value match). Geocoding billing and production credentials stay deferred to M2/M3.

---

## Separate acceptance verdicts (required)

| Lane | Verdict | Notes |
|------|---------|-------|
| Guided UX acceptance | **PASS** | Shared readiness; Start another report separated; guided chrome; nontechnical copy |
| Upload and review acceptance | **PASS** | Review now / Review later; pending survives logout; MLS already proven in 23A |
| Comparable and DOM acceptance | **PASS** | Human labels; tier not defaulted silently; listing DOM 14; market DOM 48 accepted and labeled separately |
| Complete PDF renderer acceptance | **PASS** | Week3 final 3 pages · chart · methodology · market averages · comps |
| Clean customer journey acceptance | **PASS** | Browser UI for start → range → narrative → ack → finalize → Drive (weeks 3–4) |
| Actual client historical report parity | **PARTIAL** | Structure and labels align with 855/Veterans references; page count follows live content (3), not a forced historical clone |
| Production readiness | **NOT CLAIMED** | No Vercel deploy; geocoding billing / PKL prod credentials deferred |

---

## Task23A gap closure (exact)

| 23A gap | 23B status | Evidence |
|---------|------------|----------|
| Progress 56% vs Preview completed vs Finalization ready contradiction | **CLOSED** | Shared `evaluateSignalsReadiness` / `evaluatePdfFinalization`; preview ≠ narrative-only (`tests/unit/readiness.test.ts`) |
| Download step still showed Create Report | **CLOSED** | `Start another report` toggle; create form hidden for active selected report |
| Review later control naming | **CLOSED** | Upload success: **Review now** / **Review later** (`src/app/upload/page.tsx`); 23A pending-after-relogin still valid |
| HelloData 1BR market DOM 48 pending | **CLOSED** | Staff accepted via UI/API review path; assemble `marketStats` + PDF `HelloData 1 BRs: 48 days on market` |
| Listing Avg DOM empty | **CLOSED** | Approved comp DOM edited to 14; assemble `averageDaysOnMarket: 14` (separate from market 48) |
| Rent-range chart omitted | **CLOSED** | jsPDF chart from `pricing.chart`; week3 PDF contains `Comparable rents` legend + recommended band |
| Methodology / owner wording | **CLOSED** | `Pricing methodology` section; no `candidate.row` / Eligible groups jargon in PDF test |
| Drive “blocked” without folder | **CLOSED** | Folder configured in UI; week3/week4 backups succeeded with distinct file ids |
| Final PDF frozen before comp photos | **CLOSED (workflow)** | Week4 v1→v2 snapshot immutability; old PDF bytes unchanged; new Drive identity for v2 |
| Internal extraction keys as names | **CLOSED** | `humanCandidateLabel` + missing-identity state |
| Strongest match default on unreviewed | **CLOSED** | Tier required / suggested with review (comps review UI) |
| Ack not reaching PDF render (finalize 500) | **CLOSED** | `acknowledgedWarningKeys` passed into `renderCanonicalReportPdf` |

---

## Required vs optional vs acknowledgeable

| Class | Items |
|-------|-------|
| **Required** | Report run; ≥1 approved comparable in pricing set; recommended rent range; approved narrative + snapshot; hard blockers from readiness |
| **Optional** | Drive backup folder; comparable photos; subject photos beyond minimum; agent notes |
| **Acknowledgeable warnings** | `missing_weekly` — finalize without inventing weekly figures; `defer_pending_comps` — leave leftover pending listings out when pricing set already exists |
| **Explicit non-rules** | Unrelated unit types / synthetic CT rows are not treated as Veterans 1BR evidence; market DOM never substitutes listing Avg DOM |

Pending relevant data cannot silently vanish: warnings list the outstanding keys; UI checkboxes send `acknowledgedWarningKeys` into finalize.

---

## Nine guided steps (23B screenshots)

Under `tmp/task23b/screenshots/`:

| # | Step | File |
|---|------|------|
| 1 | Upload documents | `step1-upload.png` |
| 2 | Confirm comparable data | `step2-comps.png` (+ `70-market-visible.png`, `71-1br-accepted.png`) |
| 3 | Choose subject photos | `step3-subject.png` |
| 4 | Choose comparable photos | `step4-comp-photos.png` |
| 5 | Resolve rent conflicts | `step5-conflicts.png` |
| 6 | Review weekly performance | `step6-weekly.png` |
| 7 | Set pricing recommendation | `step7-pricing.png`, `111-range-saved.png` |
| 8 | Preview and approve | `step8-preview.png`, `118-approved.png` |
| 9 | Download and save | `step9-download.png`, `125-finalized.png`, `129-drive-status.png` |

---

## PDF page-by-page (Week3 final)

**File:** `tmp/task23b/pdf/week3-final-v1.pdf` (7,724,683 bytes · **3 pages** · jsPDF)

| Check | Result |
|-------|--------|
| Building facts / subject amenities / links | Present from assemble (subject-only links) |
| Available units + asking rents | Present (`subjectRents: [1850]`) |
| Subject + comparable photographs | 2 embedded images in stream |
| Recommendation 1775–1975 | Chart legend + payload |
| Claude narrative | Approved sections locked in snapshot |
| Rent-range chart | `Comparable rents (navy) · Subject asking (gold) · Recommended band $1,775–$1,975 · Blended $2,110` |
| Market statistics | Source averages line + **Unit-type market averages (reviewed)** |
| Market DOM 48 | `HelloData 1 BRs: 48 days on market · asking $2,216 · 24 listings` |
| Listing Avg DOM | Assemble/PDF path uses approved-comp average **14** (not replaced by 48) |
| Comparable table + cards | Present |
| Methodology | `Pricing methodology` bullets |
| Weekly for correct period | Missing for 2026-11-26→12-03 — acknowledged; older weeks not promoted |
| Pre-finalization instructions | Removed from finalized output |
| Low-contrast / blank space | Improved vs 23A sparse 2-page finals; still content-driven pagination |

Week2 draft with chart (pre-market accept): `tmp/task23b/pdf/week2-draft-with-chart.pdf`.

---

## DOM end-to-end evidence

| Layer | Value | Evidence |
|-------|-------|----------|
| HelloData extract 1BR | 48 | `extracted_values` `hellodata.market.1 BRs` |
| Staff accept | accepted (+ audit decision row) | UI Accept + review API |
| Assemble | `marketStats[{daysOnMarket:48}]` separate from `stats.averageDaysOnMarket:14` | GET `/assemble` on week3 |
| PDF label | Unit-type market averages (reviewed) | week3 final PDF stream |
| Listing DOM edit | 100 Example St → 14 with note provenance | `comparable_unit_data.days_on_market` |

---

## Photograph versioning evidence (Week4)

| Step | Result |
|------|--------|
| Finalize v1 | storage `…/final-v1-….pdf` · sha `0fe1aced9737fd9d…` · 2 images |
| New approved snapshot v2 | after send-back → regenerate → approve |
| Finalize v2 | storage `…/final-v2-….pdf` · sha `76b68d49774b0fec…` · version **2** |
| v1 immutability | Re-download v1 sha **unchanged** after v2 finalize |
| Drive identity | v2 Drive id `1WuLcYbLQ9TPRin-4947WFCstqiDKj5Qw` (≠ week2/week3 ids) |
| Historical finals | Week1/2/3 Drive files remain separate; saved_to_drive locks edits |

Note: comps page had no visible file input until Manage photos on a card; version bump was proven via narrative re-approval fingerprint + new snapshot. Property already had subject/comp photos associated.

---

## Google Drive

| Check | Result |
|-------|--------|
| Folder via UI | Configured on isolated property |
| Week3 backup | `1FgGPtBo3zO7sYqZxA9uTmfVPkV5J8rAK` |
| Week4 v2 backup | `1WuLcYbLQ9TPRin-4947WFCstqiDKj5Qw` |
| Separate versions | Distinct file ids per report/version |
| Confidentiality | Only authorized Task23A folder used |

---

## Correct-period weekly data

Week3/4 periods have **no** Zillow/Apartments.com exports for those dates. Finalization required checkbox: *I understand weekly marketing figures for this period are missing…*. Older October weeks remain historical only (not promoted). 23A week1/2 already exercised period integrity.

---

## Automated verification (23B)

```
npm test        → 244 passed | 3 skipped (247) · 53 files
npm run typecheck → clean
npm run lint      → clean
npm run build     → clean
```

### Why 3 tests are skipped (not silently ignored)

| Test | Reason |
|------|--------|
| `rentometer-tabular` real 855 CSV shape | `existsSync(REAL_855_CSV)` false in this environment — optional local client fixture |
| `rentometer-pdf` real 855 PDF | same — local fixture path absent |
| `rentometer-pdf` real Veterans PDF | same — local fixture path absent |

These are **fixture-gated parser regressions**, not acceptance journey skips. Synthetic/unit coverage still runs. HelloData real-PDF helpers log SKIP when fixtures are missing without counting as vitest skips.

### Regressions added/kept

- `tests/unit/readiness.test.ts` — preview ≠ narrative; ack keys; stepper/finalization alignment  
- `tests/unit/pdf-rent-chart.test.ts` — chart + market DOM 48 labels  
- `tests/unit/candidate-display.ts` coverage via comps display helpers  

---

## Remaining external dependencies

- Local client Rentometer/HelloData fixture files for the 3 skipped parser tests  
- Geocoding billing / PKL-owned production credentials → **M2/M3**  
- Full owner-report visual parity vs printed 855 DOCX (judgment call; not forced numeric clone)  
- Optional: richer Manage-photos entry from comps list when no file input is mounted until card expand  

---

## Nontechnical UI copy

Removed/avoided in customer surfaces: Audit (as UI label), Assembly status jargon, Eligible groups, Stored PDF internals, extraction keys, snapshot/locked-version wording in owner PDF. Internal audit rows remain in DB. Business source names (HelloData, Rentometer, MLS) allowed.
