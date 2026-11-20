# Task #17 — Client reference report acceptance

**Date:** 2026-11-18  
**Project:** `mqsvrastpdratvzuouxk`  
**Strict:** Actual sources only · no fabricated values · no auto-approve of client comps · no Vercel · no commit/push · no unauthorized migrations

## Overall: **PARTIAL / BLOCKED on reference PDF parity**

The application can inventory, reconcile, extract, and generate drafts. **855 Providence branded PDF parity is not claimed** — live eligible comps remain incomplete pending human review and missing RI MLS ingest. **30 Veterans branded PDF parity is not claimed** — no 855-style authoritative final PDF exists in the package.

| Axis | Result |
|------|--------|
| 855 Providence source extraction | **PARTIAL** |
| 855 Providence calculation parity | **PARTIAL** (reference math OK; live assembly incomplete) |
| 855 Providence PDF acceptance | **BLOCKED** |
| 30 Veterans source extraction | **PARTIAL** |
| 30 Veterans calculation parity | **PARTIAL** (seed/DOCX figures; no live approved 1BR set) |
| 30 Veterans PDF acceptance | **BLOCKED** |
| Claude narrative quality | **PASS** (live verified on authorized Dbg Org data; prior Task #16) |
| Google Geocoding | **BLOCKED** (GCP billing still required) |
| Google Drive integrity | **PASS** (content-hash token + md5 fallback; Task #16B + this task) |
| Browser workflows | **PARTIAL** |
| Security and privacy | **PASS** |

---

## 1. Actual source inventory

### 855 Providence St — 2BR (West Warwick, RI 02893)

**Package:** `<LOCAL_CLIENT_SOURCE_DIR>/855 Providence St - 2BR Report Package/`  
**Authoritative final report:** `1 Report/855 Providence Street - 2 Bedroom Rental Pricing Analysis.pdf` (**13 pages**, Letter)  
Also: matching `.docx` + `.html` siblings.

| File | Role | Period / notes |
|------|------|----------------|
| `1 Report/855 Providence Street - 2 Bedroom Rental Pricing Analysis.pdf` | **Final client PDF (gold)** | Prepared ~2026-11-14; weekly 2026-11-03→11-10 |
| `1 Report/…Analysis.docx` / `.html` | Same report sources | — |
| `3 Source files/20261114-Rentometer-…-qPiKWT24DL0.csv` | Rentometer CSV | 2026-11-14 · 2-bed |
| `3 Source files/20261114-Rentometer-…-qPiKWT24DL0.pdf` | Rentometer PDF | 2026-11-14 |
| `3 Source files/855_Providence_St_-11-14-2026.pdf` | HelloData-scale PDF (**26 pp**) | 2026-11-14 |
| `3 Source files/855_Providence_11_14_26_2__Bed_Rent_Comp_Report.pdf` | Large comps PDF (**23 pp**) | 2026-11-14 |
| `3 Source files/Zillow__Listing_performance__1_.xlsx` | Weekly Zillow | Aligns with report week |
| `3 Source files/Apartment_com-_855_Providence_St.xlsx` | Weekly Apartments.com | — |
| `3 Source files/855_1.png` … `855_5.jpg` | Subject photographs | — |
| `2 For the app designer/*` | Chat/build docs | Not source data |

**Missing from package (blocks full extraction parity):**

- Rhode Island MLS CMA PDF (5 MLS reference comps unmatched live)
- Connecticut MLS CMA PDF
- Rentometer XLSX (CSV+PDF only)

**Repo codification:** `src/data/855-providence-reference.ts` (inventory only — not live approvals).

### 30 Veterans Memorial Pkwy — 1BR (East Providence, RI 02914)

| File | Role | Period |
|------|------|--------|
| `references/30-veterans-pricing-report.docx` | Closest **content** client report (*Rental Pricing Analysis*) | Prepared **Nov 9, 2026**; weekly **Oct 15–22, 2026** |
| `Downloads/…/01 PKL manual rent comp report (Aug 2026).pdf` | Older **5-page** manual *Rent Comparable Analysis* | **Aug 13, 2026** — **not** branded-template gold |
| `03 Zillow listing performance 10-22-2026.xlsx` | Weekly Zillow | As of 2026-10-22 |
| `04 Apartments.com report 10-22-2026.xlsx` | Weekly Apartments | 10/15–10/22/2026 |
| `05 RI MLS CMA report 11-01-2026.pdf` | RI MLS | 2026-11-01 · 5 unique 1BRs |
| `06 HelloData report 11-08-2026.pdf` | HelloData | 2026-11-08 |
| `Downloads/20260922-Rentometer-30_Veterans_…-srzslZYgfVs.pdf` | Rentometer | 2026-09-22 |
| `photo captures/*` (12) | Screenshots / interiors | Mixed dates |
| `src/data/veterans.ts` | Demo/regression seed from Nov DOCX | Not a client deliverable |

**Authoritative 855-style branded PDF for Veterans:** **does not exist** in package/repo/zip.

---

## 2. Reference report availability

| Property | Authoritative final | Status |
|----------|---------------------|--------|
| 855 Providence 2BR | 13-page PDF in `1 Report/` | **Available** |
| 30 Veterans 1BR | No matching branded PDF | **Unavailable** — use Nov 9 DOCX as content reference only; Aug PDF is older style |

---

## 3. 855 Providence reconciliation matrix (summary)

Live property (comps): `95e5b201-a884-42f6-9b61-d31c4e5fb5ed`  
API refresh 2026-11-18: **15** reference included · **10** exact matches · **5** unmatched (all MLS) · **16** pending human actions · **1** wrongly approved excluded HelloData no-2BR group.

### Included reference set (targets — not hardcoded into calculators)

| Comp | Source family | Ref rent | Sq ft | Tier | Live status |
|------|---------------|----------|-------|------|-------------|
| 187 3rd St #1 and #2 | Rentometer (avg 2) | $1,850 | 800–900 (850) | Strongest | Exact · pending accept |
| 630 Oaklawn Ave | Rentometer | $2,055 | 886 | Strongest | Exact · pending accept |
| 35 Old Carriage Rd | Mixed / live override | $2,115–$2,160 | 827 avg | Strongest | Exact · set tier |
| 33 Old Carriage Rd | Rentometer | $2,120 | 858 | Strongest | Exact · set tier |
| 430 Meshanticut Valley Pkwy | Rentometer | $1,950 | 784 | Strongest | Exact · pending accept |
| 22 Agnes St #1 | MLS | $1,849 | 700 | Strongest | **Unmatched — need MLS** |
| 31 Sunset Ave #1D | MLS | $1,800 | 955 | Strongest | **Unmatched — need MLS** |
| 703 Providence St #F | MLS | $1,800 | 1,000 | Strongest | **Unmatched — need MLS** |
| 303 Greenwich Ave | Mixed / live override | $2,430–$2,505 | 1,040 | Moderate | Exact · pending accept |
| 126 Toll Gate Rd | Rentometer | $1,825 | — | Moderate | Exact · pending accept |
| 42 Cedar Pond Dr | Mixed / live override | $2,425–$2,455 | 1,150 | Moderate | Exact · pending accept |
| 444 Meshanticut Valley Pkwy | Rentometer (5; 92 sf out of sf avg) | $2,183 | 938 avg | Moderate | Exact · pending accept |
| 795 Wakefield St | MLS | $1,800 | 702 | Moderate | **Unmatched — need MLS** |
| 2494 Cranston St Unit A | Rentometer | $1,480 | 800 | Context | Exact · set tier |
| 30 Wakefield St | MLS | $1,500 | 680 | Context | **Unmatched — need MLS** |

### Excluded (reference)

15 Dwight · 32 Vinton · 3595 Post Rd · 2 Machowski · HelloData communities with **no 2BR**.

### Reviewer decisions still required (do not script)

1. Reject HelloData no-2BR rows (incl. wrongly approved Chateau Regale / Lake).  
2. Accept pending Rentometer rows with suggested tiers.  
3. Set tiers on already-approved Old Carriage / Cranston rows.  
4. **Obtain & upload RI MLS CMA**, then accept 5 MLS comps.  
5. Resolve >$25 live listing overrides (Old Carriage, Villa Del Rio, Royal Crest) — Kent if ambiguous.  
6. Confirm PKL range **$1,925–$2,000**; approve narrative; snapshot; finalize.  
7. Align weekly metrics onto the comps property if final PDF must include weekly pages.

**No client comps were auto-approved in this task.**

---

## 4. 30 Veterans reconciliation matrix (summary)

| Layer | Finding |
|-------|---------|
| Gold PDF | **Missing** |
| Nov 9 DOCX / `veterans.ts` | Recommended **$2,075–$2,200**; blended seed **~$2,082**; week Oct 15–22 |
| Aug 5-page PDF | Asking **$2,050–$2,200**; blended **$2,059**; different 6-comp set — **not** template gold |
| HelloData 11/8 | 4 buildings; illustrative only |
| MLS 11/1 | 5 listings; seed excludes older stock |
| Rentometer 9/22 | 1-mile mean **$1,500** — different universe |
| Photos | Raw screenshots; not mapped 3:2 print set |

Mixed as-of dates prevent claiming a single authoritative “final” stack without staff choice.

---

## 5. Calculation comparisons

### 855 — independent recalc from reference included set

| KPI | Reference PDF | Independent (midpoint ranges) | Live assembly (2026-11-18) |
|-----|---------------|-------------------------------|----------------------------|
| Eligible groups | 15 | 15 | **3** |
| Blended avg | $1,950 | $1,950 | Not comparable |
| Avg $/sf | $2.27 | $2.27 | Incomplete |
| Range | $1,480–$2,468 | $1,480–$2,468 | Incomplete |
| Rentometer set avg | $2,050 | ~$2,051 (±$1 rounding) | Incomplete |
| MLS set avg | $1,750 | $1,750 | N/A (MLS not ingested) |
| PKL recommendation | $1,925–$2,000 | Manual (unchanged) | Manual |

**Conclusion:** Calculation formulas are consistent with the reference inventory. Live gaps are **data/review selection**, not forced formula changes.

### Veterans

Prior Tasks #4/#7/#8 match source extracts for Zillow/Apartments/MLS/HelloData parsers. Live 1BR approved-comp assembly for a branded PDF was **not** completed here (would require human 1BR approvals).

---

## 6. Parser / matching defects found

| Issue | Severity | Disposition |
|-------|----------|-------------|
| 855 package lacks RI MLS CMA → 5 unmatched MLS comps | High | Human: supply/upload MLS |
| Live listing overrides >$25 vs Rentometer (documented in reference notes) | Medium | Human conflict/override |
| 444 Meshanticut 92 sf observation | Known | Already excluded from sqft avg by design |
| Same-address averaging (187 3rd, Old Carriage, 444) | Known | Reference + reconcile UI |
| Comparables UI shows 855 reconciliation chrome on non-855 properties | UX | Note only — no redesign this task |
| Drive: same filename/size different bytes could collide | Fixed | Content SHA-256 in backup token + md5 check on name fallback |

---

## 7. Fixes implemented (this task)

1. **Drive content identity:** `backupToken` now includes PDF `contentSha256`; name fallback requires matching Drive `md5Checksum` when present.  
2. **Regression tests:** `tests/unit/google-drive-content-identity.test.ts`.  
3. Documentation + refreshed live reconcile evidence (no client approvals).

---

## 8. Required human review decisions

### 855 (blocking PDF acceptance)

See §3 checklist — especially MLS upload + Accept/Exclude/tier actions on `/buildings/95e5b201-a884-42f6-9b61-d31c4e5fb5ed/comparables`.

### Veterans (blocking PDF acceptance)

1. Name the gold file (export Nov 9 DOCX → Letter PDF, or accept that branded parity cannot be claimed).  
2. Choose one as-of stack across Rentometer / weekly / MLS / HelloData.  
3. Staff-only 1BR accept/exclude/tier on a live Veterans property.  
4. Map/crop photos; clear DOCX placeholders.

---

## 9. Generated PDF locations

| Artifact | Location / note |
|----------|-----------------|
| 855 reference gold | Downloads `…/1 Report/…Analysis.pdf` (13 pp) |
| Live 855 draft (incomplete comps) | Task10a run: **3 pages**, engine jspdf; eligibleGroupedCount **3** — **not** parity |
| Dbg Org Task16B finals | Private storage + Drive `PKL DEV Reports` (authorized test only) |

No complete 855 or Veterans reference-parity PDF was generated in this task.

---

## 10. Page-by-page visual review

**Not performed against a complete generated 855/Veterans final** — blocked by incomplete approved sets / missing Veterans gold PDF.

Reference gold (855) remains the 13-page Letter document inspected in Task #10/#10A. Live draft at 3 pages must **not** be marked as reference parity.

---

## 11. Browser test evidence (localhost)

| Path | Result |
|------|--------|
| Sign-in / org | PASS (ephemeral Task05 user) |
| Data Uploads UI | PASS — Rentometer/HelloData/MLS source types, file drop, private storage copy |
| 855 Comparables reconciliation | PASS (read-only) — 15/10/5/16 matrix; Accept/Exclude/tier buttons present; **not clicked** |
| Fourteen B property photos | PASS — Upload photo, crop-to-3:2 copy, private previews |
| Drive Settings / history | PASS (Task #16B) — Connected, Saved to Google Drive |
| Full HelloData/MLS upload→parse→approve on 855 | **Not completed** (would mutate client review state / needs MLS file) |
| Photo crop/reorder interaction depth | **PARTIAL** — UI present; full crop/reorder session not exercised end-to-end this pass |

---

## 12. Geocoding status

**BLOCKED.** Key present; live Geocoding API still `REQUEST_DENIED` (GCP **billing** required). No fabricated distances. Reference distances remain as listed in `855-providence-reference.ts` for matrix purposes only.

---

## 13. Google Drive integrity verification

Prior Task #16B live PASS retained. This task strengthened identity:

| Case | Behavior |
|------|----------|
| Identical retry | Replays via status / appProperty token |
| Same size, different bytes | Distinct `contentSha256` → distinct token |
| Name fallback | Requires md5 match when Drive returns checksum |
| Versions | Token includes snapshot version |
| Immutable snapshot | Unchanged (payload still protected) |

Authorized DEV folder only (`PKL DEV Reports`). No client finals uploaded to personal folders in this task.

---

## 14. Automated test results

```
npm test         → 198 passed (36 files)
npm run typecheck → pass
npm run lint      → pass
npm run build     → pass (awaited in session)
```

Live: `node scripts/task10a-855-reconcile.mjs` → `pass_reconcile_pending_human_approval` pattern; visualParity **not_claimed**.

---

## 15. Remaining acceptance blockers

1. Human approvals on 855 comps (+ reject no-2BR HelloData).  
2. Supply/upload **RI MLS CMA** for 855 (and CT if contractual).  
3. Complete weekly+comps on one 855 property before final PDF.  
4. Enable **GCP billing** for Geocoding.  
5. Veterans: produce/export branded gold PDF **or** formally waive 855-style PDF parity.  
6. Veterans: human 1BR review + photo mapping.  
7. After (1–3): regenerate final 855 PDF, render every page to images, side-by-side vs 13-page gold.

---

## Exact outstanding reviewer actions (short list)

1. Open 855 comps UI → execute Accept / Exclude / Set tier per §3 (no agent automation).  
2. Provide RI MLS CMA for 855 Providence 2BR and upload via Data Uploads.  
3. Enable Google Cloud billing for Geocoding.  
4. Decide Veterans gold (export Nov DOCX PDF vs waive branded parity).  
5. After comps complete: approve narrative → snapshot → finalize → Drive backup → visual QA vs gold.
