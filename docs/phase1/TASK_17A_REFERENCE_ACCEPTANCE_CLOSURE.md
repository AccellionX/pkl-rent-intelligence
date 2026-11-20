# Task #17A — Reference Acceptance Closure

**Date:** 2026-11-18  
**Overall:** **PARTIAL**  
**Phase:** 1 only · no Vercel deploy · no commit/push · no client comparable auto-approvals

---

## Verdict axes

| Axis | Result |
|------|--------|
| MLS source recovery (identity proof) | **PASS** (recovered sources exist; **not** the five 855 MLS comps) |
| 855 missing MLS documents | **BLOCKED** (package + private storage lack 855 RI MLS CMA) |
| Human review checklist (16 actions) | **PASS** (documented; UI instructions; none auto-approved) |
| Controlled full report (Dbg Org) | **PASS** |
| PDF visual/layout vs 855 gold structure | **PARTIAL** (renderer exercises full section order; page count follows data) |
| 855 client numerical / branded parity | **BLOCKED** (pending human review + MLS ingest) |
| Veterans DOCX content reconciliation | **PASS** |
| Veterans branded PDF visual vs 855 | **BLOCKED** (no LibreOffice / no gold PDF) |
| Geocoding | **BLOCKED** (GCP billing) — skipped per instructions |
| Automated checks | **See §8** |

---

## 1. MLS source recovery

### `<LOCAL_CLIENT_SOURCE_DIR>/Report (1).pdf`

- **Actual contents:** Connecticut **connectMLS** CMA (footer/agent markers; Task #06/#07 reference listings such as Norwich-area MLS `24221286` / peers).
- **Not** an 855 Providence / West Warwick RI State-Wide MLS CMA.
- **Does not contain** MLS `#1427449`, `#1426750`, `#1424453`, `#1428060`, `#1426416` or addresses `22 Agnes`, `31 Sunset`, `703 Providence`, `795 Wakefield`, `30 Wakefield`.

### RI MLS CMA (`05 RI MLS CMA report 11-01-2026.pdf`)

- Recovered from Veterans package + private storage (Task #06/#07 / Veterans subject paths).
- Listings include Veterans-area comps (e.g. MLS `1420890`, `1424879` / Bentley / California street text).
- **Does not contain** the five 855 unmatched MLS numbers or addresses above.
- **Do not associate** these records with 855 Providence comps.

### 855 property private storage

- Live `855 Providence St` source documents: HelloData PDF, Rentometer CSV, Zillow XLSX, Apartments.com XLSX.
- **No** `mls_ri_pdf` / `mls_ct_pdf` on the 855 property.

### Recovered vs still missing

| Document | Status |
|----------|--------|
| CT connectMLS `Report (1).pdf` | Recovered (authorized local + Task7 storage) — **wrong property set for 855** |
| RI Statewide CMA (Veterans) | Recovered — **wrong property set for 855** |
| **855 RI MLS CMA** covering five unmatched comps | **MISSING** — user must supply |

---

## 2. Human review checklist (16 pending actions)

**Do not auto-approve actual client comparables.** Complete in UI only.

### UI path (855 Providence)

1. Sign in → set org to the live client org that owns **855 Providence St**.
2. Open **Properties** → **855 Providence St** → **Comparables**.
3. Use **Refresh** so reconciliation counts update.
4. For each row below: set **Review reason (audit)** if required, then **Accept** / **Exclude** / **Set tier** as specified.
5. After MLS upload (when available): re-parse → accept the five MLS rows with suggested tiers.
6. Open **Pricing & Reports** only after eligible approved comps support assembly.

### Checklist

| # | Property | Address / label | Rent | Sq ft | Tier | Recommended action | Reason / evidence |
|---|----------|-----------------|------|-------|------|--------------------|-------------------|
| 1 | 187 3rd St #1 and #2 | 187 3rd St | $1,850 | 800–900 (avg 850) | strongest | Accept extraction(s) as strongest | Exact Rentometer match; live pending (2) |
| 2 | 630 Oaklawn Ave (Meshanticut House) | 630 Oaklawn Ave | $2,055 | 886 | strongest | Accept as strongest | Exact; Rentometer · Apartments.com; pending (1) |
| 3 | 35 Old Carriage Rd (Shady Oaks & Pilgrim Park) | 35 Old Carriage Rd | $2,115–$2,160 | 812–858 (avg 827) | strongest | Set match tier **strongest** on approved unit row(s); review remaining HelloData pending | Partial — 3 approved / 1 pending |
| 4 | 33 Old Carriage Rd | 33 Old Carriage Rd | $2,120 | 858 | strongest | Set match tier **strongest** on approved unit row(s) | Approved (2); tier unset |
| 5 | 430 Meshanticut Valley Pkwy (Woodridge Manor) | 430 Meshanticut Valley Pkwy | $1,950 | 784 | strongest | Accept as strongest | Exact; pending (1) |
| 6 | 22 Agnes St #1 | 22 Agnes St #1 | $1,849 | 700 | strongest | Upload/parse **855 RI MLS CMA**, then accept MLS `#1427449` | Unmatched — missing candidate |
| 7 | 31 Sunset Ave #1D | 31 Sunset Ave #1D | $1,800 | 955 | strongest | Upload/parse RI MLS CMA, accept `#1426750` | Unmatched — missing candidate |
| 8 | 703 Providence St #F | 703 Providence St #F | $1,800 | 1000 | strongest | Upload/parse RI MLS CMA, accept `#1424453` | Unmatched — missing candidate |
| 9 | 303 Greenwich Ave (Villa Del Rio) | 303 Greenwich Ave | $2,430–$2,505 | 1040 | moderate | Accept as moderate | Exact; pending (2) |
| 10 | 126 Toll Gate Rd (Gristmill Apartments) | 126 Toll Gate Rd | $1,825 | — | moderate | Accept as moderate | Exact; pending (1) |
| 11 | 42 Cedar Pond Dr (Royal Crest Warwick) | 42 Cedar Pond Dr | $2,425–$2,455 | 1150 | moderate | Accept as moderate | Exact; pending (2) |
| 12 | 444 Meshanticut Valley Pkwy (Western Hills) | 444 Meshanticut Valley Pkwy | $2,183 | 784–1150 (avg 938) | moderate | Accept as moderate; reconcile rent conflicts vs reference $2,183 | Pending (5); live rents diverge >$25 on several rows |
| 13 | 795 Wakefield St | 795 Wakefield St | $1,800 | 702 | moderate | Upload/parse RI MLS CMA, accept `#1428060` | Unmatched — missing candidate |
| 14 | 2494 Cranston St, Unit A | 2494 Cranston St a | $1,480 | 800 | context | Set match tier **context** on approved unit row(s) | Approved (2); tier unset |
| 15 | 30 Wakefield St | 30 Wakefield St | $1,500 | 680 | context | Upload/parse RI MLS CMA, accept `#1426416` | Unmatched — missing candidate |
| 16 | HelloData comps without a 2BR listing (Chateau Regale, Lake, Fifty West, Bush Gardens, Dean Estates, Chateau Belvedere, Warwick Terrace Annex, Brookside Village) | (group) | — | — | excluded | **Reject / exclude** wrongly approved / pending no-2BR rows | Reference excluded; live WARNING approved-but-excluded |

---

## 3. Controlled full report (Dbg Org)

**Isolation:** organization `Dbg Org` · property `Seventeen A Controlled m92b6l` · report `Task17A Controlled Full Report`.

| Step | Result |
|------|--------|
| Upload Rentometer CSV / RI MLS PDF / Zillow / Apartments.com | PASS (API) |
| Controlled Accept (6) + Exclude (1) via review API | PASS (synthetic only) |
| Photo upload | PASS |
| Assemble | PASS — eligible groups **4**, blended **$2,045** |
| Narrative generate + approve | PASS (deterministic fallback after live Claude error on this run; prior run used live Claude) |
| Snapshot | PASS v1 |
| Draft + final PDF | PASS — **3 pages**, jsPDF, ~230 KB |
| Finalize blockers cleared | PASS |
| Transition → Drive backup | PASS — status **Saved to Google Drive** |
| Browser PDF workspace | PASS — Final PDF Stored (v1); Drive open link reachable (browser hit Google sign-in for viewing) |
| Browser Data Uploads page | PASS (loads; source-type form present) |
| Browser Comparables on non-855 property | **PARTIAL / known UX** — still shows 855 reference reconciliation chrome |

**Local artifact (no secrets):** `tmp/task17a/controlled-final-f966bf87.pdf` · page renders `tmp/task17a/ctrl-p01.png` … `ctrl-p03.png`.

---

## 4. PDF visual acceptance (renderer vs 855 gold)

**Gold:** `855 Providence Street - 2 Bedroom Rental Pricing Analysis.pdf` — **13 pages** Letter.  
**Controlled final:** **3 pages** — page count follows available approved comps / weekly / photos; **not forced** to 13.

| Page | Controlled finding | vs gold structure |
|------|--------------------|-------------------|
| 1 | Navy/gold header, subject block, recommendation banner, KPI cards, pricing narrative | Section order aligns; gold has richer photo strip (3 across), filled unit table, denser subject facts |
| 2 | Comp table + tier cards + weekly metrics | Present; gold spreads comps across many detail pages |
| 3 | Tours / prospect feedback + footnotes | Sparse whitespace when agent weekly fields empty — honest empty state, not fabricated content |
| 4–13 | N/A on controlled | Gold-only depth (per-comp detail, charts) needs full approved 855 set |

### Bugs fixed this task

1. **MLS orphan photos as subject photos** — unmatched MLS ingest wrote `report_photos` with `comparable_property_id=null`, inflating subject count (“21 on file”).  
   - Fix: skip subject attachment in `persist-mls.ts`; filter `source=mls` orphans in `assemble.ts` and photos `GET`.
2. **Subject PDF gallery** — renderer now lays out up to **3** subject photos side-by-side (closer to gold page 1).
3. **Controlled report accept path** — review payload requires `reason` + `unitTypeId`; extraction select used non-existent columns (fixed in `scripts/task17a-controlled-report.mjs`).
4. **PII false positive** — long digit stamps in property names blocked snapshot; short alphanumeric suffix used.

**Visual renderer acceptance:** **PARTIAL PASS** (branded Letter structure exercises; not client parity).  
**Client numerical parity:** **not claimed**.

---

## 5. Veterans reference

- **DOCX:** `references/30-veterans-pricing-report.docx` (XML text extract).
- **Content reconciliation:** PASS — recommendation **$2,075–$2,200**, blended **~$2,082**, range **$1,788–$2,333**, **$2.79**/sf, HelloData DOM **48 days**, comps including Waterman / Kettle / Christine / Newport.
- **Branded PDF visual vs 855:** **BLOCKED** — LibreOffice not installed; no 855-style Veterans gold PDF in package. No unrelated tool installs pursued.

---

## 6. Geocoding

**BLOCKED** on GCP billing (`REQUEST_DENIED`). Not re-called. Distance fields remain null where geocode fails; no fabricated distances.

---

## 7. Browser scenarios

| Scenario | Result |
|----------|--------|
| Sign-in session on Dbg Org dashboard | PASS |
| Controlled property overview (Drive folder verified, report Saved to Drive) | PASS |
| Subject photos UI (Upload / Up / Down / Crop / Reuse present) | PASS (MLS orphans previously flooded gallery — filter fixed) |
| Data Uploads page | PASS |
| PDF Report workspace (draft download control, final stored, Drive status) | PASS |
| Open in Google Drive | PASS to Drive file URL (viewer requires Google account sign-in in automation browser) |
| Comparables Accept/Exclude on **855** | **Not executed** (human-only; checklist provided) |
| Comparables UI on controlled property | FAIL/partial — 855 reference chrome shown for non-855 building |

---

## 8. Automated verification

Server left running (`/api/health` 200); not killed.

| Command | Result |
|---------|--------|
| `npm test` | **PASS** — 36 files / **198** tests |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

---

## 9. Exact actions required from you

1. **Supply/upload the 855 Providence RI State-Wide MLS CMA** that contains MLS `#1427449`, `#1426750`, `#1424453`, `#1428060`, `#1426416` (do **not** reuse Veterans/CT files).
2. Complete the **16 human review actions** in §2 on the live 855 Comparables UI (no agent auto-approve).
3. Enable **GCP billing** for Geocoding when distance fields are required.
4. Optional: export/provide a **Veterans branded gold PDF** if 855-style visual parity is contractual; otherwise formally waive.
5. After (1–2): regenerate 855 final PDF and run page-by-page acceptance vs the 13-page gold.

---

## 10. Readiness for Task #18

**Ready for Task #18 planning** with acceptance gaps explicitly closed or blocked as above.  
**Not ready** to claim Phase 1 reference-report **PASS** until MLS ingest + human reviews + 855 final PDF visual parity complete.

---

## Evidence pointers (non-secret)

- Controlled property / report exercised via authenticated API + browser PDF workspace.
- Checklist snapshot: `/tmp/pkl-17a-checklist.json` (session).
- PDF pages: `tmp/task17a/ctrl-p0*.png`.
- Prior Task #06/#07 docs remain authoritative for CT/RI parser identity.
