# Task #10A — 855 Providence Reference Data Reconciliation & PDF Acceptance

**Overall status:** **PARTIAL** (reconciliation + review tooling complete; human approvals still required)  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk`  
**Canonical live property for comps:** `95e5b201-a884-42f6-9b61-d31c4e5fb5ed` (org `e980a609-5baf-455c-a7e2-a6322d738f87`)

No comps were auto-approved. No fabricated acceptance. No commit / push / deploy.

---

## Axis results (required)

| Axis | Result |
|------|--------|
| Reference reconciliation | **PASS** |
| Approved comps | **BLOCKED** (staff actions required) |
| Calculations | **PARTIAL** (formulas unchanged; live set incomplete vs reference) |
| PDF visual matching | **BLOCKED** (draft 2 pages vs reference 13; incomplete approved set) |
| Acceptance | **BLOCKED** |

---

## 1. Actual reference comp inventory

Source: `855 Providence Street - 2 Bedroom Rental Pricing Analysis.pdf` (13 pages, US Letter 612×792). Codified in `src/data/855-providence-reference.ts`.

### Recommendation & KPIs (reference)

| Field | Value |
|-------|-------|
| PKL range | **$1,925 – $2,000** |
| Blended average (15 comps) | **$1,950** |
| Average $/sq ft | **$2.27** |
| Comp rent range | **$1,480 – $2,468** |
| Rentometer-set average | **$2,050** |
| MLS-set average | **$1,750** |
| HelloData wider 2BR average | **$2,158** on 952 sq ft (context, not curated 15) |

### Included (15 groups)

| Tier | Property | Rent | Sq ft | Source |
|------|----------|------|-------|--------|
| Strongest | 187 3rd St #1 and #2 | $1,850 | 800–900 (avg 850) | Rentometer (2 averaged) |
| Strongest | 630 Oaklawn Ave | $2,055 | 886 | Rentometer |
| Strongest | 35 Old Carriage Rd | $2,115–$2,160 | 812–858 (avg 827) | Rentometer + live Apts.com override |
| Strongest | 33 Old Carriage Rd | $2,120 | 858 | Rentometer |
| Strongest | 430 Meshanticut Valley Pkwy | $1,950 | 784 | Rentometer |
| Strongest | 22 Agnes St #1 | $1,849 | 700 | MLS |
| Strongest | 31 Sunset Ave #1D | $1,800 | 955 | MLS |
| Strongest | 703 Providence St #F | $1,800 | 1,000 | MLS |
| Moderate | 303 Greenwich Ave (Villa Del Rio) | $2,430–$2,505 | 1,040 | Rentometer + live override |
| Moderate | 126 Toll Gate Rd | $1,825 | — | Rentometer |
| Moderate | 42 Cedar Pond Dr (Royal Crest) | $2,425–$2,455 | 1,150 | Rentometer + live override |
| Moderate | 444 Meshanticut Valley Pkwy | $2,183 avg | 784–1,150 (avg 938) | Rentometer (5 averaged; 92 sf excluded from sf avg) |
| Moderate | 795 Wakefield St | $1,800 | 702 | MLS |
| Context | 2494 Cranston St, Unit A | $1,480 | 800 | Rentometer |
| Context | 30 Wakefield St | $1,500 | 680 | MLS |

### Excluded (reference)

- 15 Dwight St — outlier SFH $3,500  
- 32 Vinton Ave — removed in review  
- 3595 Post Rd (2 units) — removed in review  
- 2 Machowski St — removed in review  
- HelloData communities with **no 2BR** advertised: Chateau Regale, Lake, Fifty West, Bush Gardens, Dean Estates, Chateau Belvedere, Warwick Terrace Annex, Brookside Village  

### Source-file notes

- Rentometer CSV `qPiKWT24DL0` supplies the working set; several reference rents use **Apartments.com live overrides** (esp. Old Carriage, Villa Del Rio, Royal Crest) — raw Rentometer ≠ final reference figure.  
- Dwight / Vinton / Post / Machowski are **not** in the exported CSV working set (PDF “Reviewed and excluded”).  
- RI MLS CMA was **not** present as a parsed document on the comps property at reconciliation time.

---

## 2. Candidate reconciliation matrix (live)

API: `GET /api/properties/{id}/comparables/reconciliation`  
Live E2E (`npm run task10a:e2e`): **pass_reconcile_pending_human_approval**

| Summary | Count |
|---------|-------|
| Reference included | 15 |
| Exact address matches in live data | **10** |
| Unmatched included (all MLS) | **5** |
| Pending human actions | **16** |
| Wrongly approved but reference-excluded | **1** (HelloData no-2BR group: Chateau Regale / Lake) |

### Unmatched (require MLS ingest)

1. 22 Agnes St #1  
2. 31 Sunset Ave #1D  
3. 703 Providence St #F  
4. 795 Wakefield St  
5. 30 Wakefield St  

### Already present / pending accept (Rentometer / HelloData)

187 3rd (#1 and #2), 630 Oaklawn, 430 Meshanticut, 303 Greenwich, 126 Toll Gate, 42 Cedar Pond, 444 Meshanticut (multi-unit), plus tier assignment on already-approved Old Carriage / 2494 Cranston rows.

### Duplicate / same-address observations

- 187 3rd St #1 and #2 — two pending extraction rows; reference averages as one group.  
- 35 Old Carriage — two Rentometer rows (+ HelloData community); reference uses live listing rents.  
- 444 Meshanticut — five Rentometer unit rows including invalid 92 sq ft observation.

### Property sprawl warning

Multiple `855 Providence St` property rows exist across orgs. Weekly metrics live on **different** clones than the Rentometer/HelloData comps org. Staff should work comps on **`95e5b201-…`** (or consolidate) before claiming a complete weekly+comps draft.

---

## 3. Pending human approval actions

**Do these in the UI — agents must not script approvals.**

Open: `/buildings/95e5b201-a884-42f6-9b61-d31c4e5fb5ed/comparables`

1. **Reject** HelloData unit rows for Chateau Regale / Lake (reference excluded — no 2BR).  
2. **Set match tiers** on already-approved rows:  
   - 35 Old Carriage → `strongest`  
   - 33 Old Carriage → `strongest`  
   - 2494 Cranston → `context`  
3. **Accept** pending Rentometer extractions with suggested tiers (UI shows “855 ref: …”):  
   - strongest: 187 3rd (#1+#2), 630 Oaklawn, 430 Meshanticut  
   - moderate: 303 Greenwich, 126 Toll Gate, 42 Cedar Pond, 444 Meshanticut (all unit rows; keep 92 sf out of sqft avg via existing formula)  
4. **Upload & parse RI MLS CMA**, then accept the five MLS comps with tiers above.  
5. For Old Carriage / Villa Del Rio / Royal Crest: if live listing rents differ &gt; $25 from Rentometer, resolve via conflict / override using report-date listing figures (Kent decision if unclear).  
6. Confirm PKL recommendation remains **$1,925–$2,000** on the report run.  
7. Approve narrative + create snapshot only after the eligible approved set is complete.  
8. Re-ingest or copy weekly Zillow/Apartments metrics onto the comps property if the draft must carry page-12/13 weekly sections.

---

## 4. Calculation comparison

Deterministic formulas were **not** changed to force reference numbers.

| KPI | Reference PDF | Live assembly (comps property, current) | Likely cause |
|-----|---------------|-------------------------------------------|--------------|
| Eligible grouped comps | 15 | **3** | Most reference comps still pending / MLS missing; HelloData no-2BR excluded from stats |
| Blended average | $1,950 | Not comparable until set complete | Comp selection |
| Avg $/sf | $2.27 | Incomplete | Comp selection + sqft validity |
| Range | $1,480–$2,468 | Incomplete | Comp selection |
| Rentometer set avg | $2,050 | Incomplete | Selection + live-listing overrides |
| MLS set avg | $1,750 | **N/A** | MLS not ingested on this property |
| HelloData wider avg | $2,158 | Source summary (not curated 15) | Distinct definition — preserve |

**Kent decision flags (do not code around):**

- Whether to keep report-date Apartments.com overrides vs raw Rentometer for Old Carriage / Villa Del Rio / Royal Crest.  
- Whether 126 Toll Gate (missing sqft) stays in rent average only (reference does).  
- Consolidation of duplicate 855 property rows / weekly metrics home.

---

## 5. Actual generated PDF page count

| Document | Pages |
|----------|-------|
| Reference PDF | **13** |
| Live draft on comps property (`task10a:e2e`) | **2** (jspdf, DRAFT, stored private) |
| Final PDF | **Blocked** (finalization guards) |

Incomplete sections remain labeled DRAFT. No blank-page padding toward 13.

---

## 6. Visual comparison findings

| Area | Finding |
|------|---------|
| Page count | 2 vs 13 — blocked by incomplete approved comps |
| Section order | Template follows 855 order; content missing for most cards |
| Typography | jsPDF Helvetica ≠ LibreOffice Writer fonts |
| Colors | Navy/gold brand tokens aligned with app |
| Photos | Placeholders only — “Photo to be added”; no MLS image scrape |
| Charts | KPI/source labels from payload; not Word chart graphic |
| Tables | Present; thin until comps approved |
| Headers/footers | Present with DRAFT marker |
| Playwright | Optional path documented in Task #10; not required for this reconcile step; still recommended for closer print fidelity **after** data approval |

**No visual parity claimed.**

---

## 7. Bugs fixed

1. Live comparables page was demo-only — added **reference reconciliation UI** for UUID properties.  
2. Reconciliation API initially selected nonexistent `processing_status` — fixed to `parse_status`.  
3. Upload review now surfaces **855 ref tier / excluded** badges and Accept-as-tier without changing default auto behavior.  
4. Added human-only `PATCH /api/comparable-unit-data/[id]` for tier / reject with reviewer reason audit trail.

---

## 8. Tests

| Command | Result |
|---------|--------|
| `npm test` | **108 passed** / 23 files (incl. `reconcile-855.test.ts`) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** (after UI effect fix) |
| `npm run build` | **PASS** |
| `npm run task10a:e2e` | **pass_reconcile_pending_human_approval** |
| Finalization still blocked | **Yes** |
| Private draft store | **Yes** |
| Auto-approve used | **No** |

---

## 9. Outstanding gaps

1. Staff must complete the approval checklist in §3.  
2. MLS CMA not on the comps property.  
3. Weekly metrics / subject amenities / photos incomplete on comps org.  
4. Prior Task #05 e2e “accept” rows (notes `task05 e2e accept`) are **not** PKL business sign-off — re-verify tiers / exclusions.  
5. jsPDF cannot match Writer layout; Playwright worker still optional post-approval.  
6. Duplicate 855 properties across orgs.

---

## 10. Acceptance status

**BLOCKED** pending human approval of the reference-backed comparable set and MLS ingest.

### Recommended next step

Staff completes §3 on property `95e5b201-…` → regenerate draft → page-screenshot diff vs 13-page reference → only then finalize from immutable snapshot.
