# Task #4 — HelloData PDF Enrichment, Conflict Detection & Deterministic Calculations

**Status:** **PARTIAL**  
**Date:** 2026-11-17  

| Layer | Result |
|-------|--------|
| HelloData PDF parser (synthetic + real local files) | **PASS** |
| Matching / $25 conflict / deterministic calcs (unit tests) | **PASS** |
| Upload / reprocess / review / conflict / draft-stats APIs | **PASS** (code + demo-mode auth gates) |
| Upload UI (HelloData source, match tier, conflict resolve) | **PASS** (light reuse of existing upload workspace) |
| Live Supabase E2E (auth → storage → conflicts → stats) | **BLOCKED** — Task #4 migration not verified applied on a live project; no authenticated E2E claimed |

No deploy, commit, or push. Raw client HelloData PDFs were **not** copied into the repository.

---

## 1. Implemented features

### Part A — HelloData extraction
- Schema-oriented PDF text extraction via `unpdf` (native text; no OCR/LLM synthesis).
- Parses **Rent Comps / Benchmark** building cards, **Report Map** metadata, and **Unit Type Metrics** (market trailing 1 month).
- Separates subject building from comps; subject ignored for enrichment.
- Preserves raw block, page ref (`Rent Comps`), rents/sqft/psf, missing-unit flags (`No {unit} available`), report date, date range.
- Uploads use existing private `source-documents` bucket + `source_documents` / `extracted_values` lifecycle (`persistHelloDataParse`).

### Part B — Comp matching & enrichment
- Conservative normalized-address matcher with alias support; ambiguous dual matches require human resolution.
- Same house number on a different street does not auto-match.
- HelloData accepts create **source-specific** `comparable_unit_data` (`source_type: hellodata`) and never overwrite Rentometer approved rows.
- New HelloData-only properties remain review candidates until accepted.
- Missing unit-type data retained with `has_available_data=false` and note `No {unit type} available`.

### Part C — $25 conflict rule
- Flags absolute rent delta **strictly greater than $25** (exact $25 does **not** flag).
- Ranges are non-comparable for automatic $25 checks.
- `source_value_conflicts` table + list/resolve APIs; unresolved conflicts excluded from draft KPIs.
- Resolution records chosen rent, listing source, verification date, reviewer note; does not mutate finalized snapshots.

### Part D — Deterministic calculation engine
Pure TypeScript in `src/lib/calculations` (no AI):
- monthly comparable rent, $/sqft, range, Rentometer-set / MLS-set / HelloData-set / blended averages
- same-address grouping by `buildingKey + addressKey + unitTypeKey`
- invalid rent/sqft exclusion per calculation; missing sqft never fabricates $/sqft
- money `Math.round`; PSF 2 decimals
- manual recommendation low/high remain user-owned (stats API documents this)

### Part E — Review UI / API
- `POST /api/uploads` accepts `hellodata_pdf`
- `POST /api/uploads/[id]/reprocess` supports HelloData reprocess without overwriting prior decisions
- `GET /api/properties/[id]/conflicts`
- `POST /api/conflicts/[id]/resolve`
- `GET /api/reports/[id]/stats` draft KPIs from approved+eligible comps
- Upload page: HelloData source type, source badges, match tier select, missing-unit hints, conflict resolve panel

### Part F — Tests
Synthetic fixtures + optional real-file regression (paths under Downloads; not committed).

---

## 2. Files changed / added

### Added
- `supabase/migrations/20260317160000_task04_hellodata_conflicts.sql`
- `src/lib/extraction/hellodata-pdf.ts`
- `src/lib/extraction/hellodata-types.ts`
- `src/lib/extraction/matching.ts`
- `src/lib/extraction/conflicts.ts`
- `src/lib/extraction/persist-hellodata.ts`
- `src/lib/extraction/source-types.ts`
- `src/app/api/properties/[id]/conflicts/route.ts`
- `src/app/api/conflicts/[id]/resolve/route.ts`
- `src/app/api/reports/[id]/stats/route.ts`
- `tests/fixtures/hellodata/synthetic-rent-comps.txt`
- `tests/unit/hellodata-pdf.test.ts`
- `tests/unit/hellodata-real-pdf.test.ts`
- `tests/unit/matching.test.ts`
- `tests/unit/conflicts.test.ts`
- `tests/unit/calculations.test.ts`
- `docs/phase1/TASK_04_HELLODATA_AND_CALCULATIONS_REPORT.md`

### Changed
- `src/lib/calculations/index.ts`, `types.ts` — full deterministic formulas (stubs removed)
- `src/lib/extraction/file-validation.ts`, `index.ts`, `normalize.ts`
- `src/app/api/uploads/route.ts`, `uploads/[id]/reprocess/route.ts`
- `src/app/api/extractions/[id]/review/route.ts` — HelloData accept path + match tier
- `src/app/upload/page.tsx` — HelloData + conflicts + match tier (no redesign)
- `src/domain/database.types.ts` — `source_value_conflicts`
- `tests/unit/calculations-privacy.test.ts`, `file-validation.test.ts`

---

## 3. HelloData source files tested

| File | Path (local only) |
|------|-------------------|
| 855 Providence HelloData | `<LOCAL_CLIENT_SOURCE_DIR>/855 Providence St - 2BR Report Package/3 Source files/855_Providence_St_-11-14-2026.pdf` |
| 30 Veterans HelloData | `<LOCAL_CLIENT_SOURCE_DIR>/30 Veterans 1BR report - source files/06 HelloData report 11-08-2026.pdf` |

Not committed. Synthetic fixture: `tests/fixtures/hellodata/synthetic-rent-comps.txt`.

---

## 4. Extraction field mapping

| Source region | Fields | Scope |
|---------------|--------|-------|
| Executive Summary | subject name, address line, report date | property / report |
| Rent Comps (Benchmark cards) | name, distance, address, city/state/zip, year built, units, stories, Studio/1/2/3 BR rent/sqft/psf or unavailable | property + unit-type |
| Report Map | address, year built, units, distance, similarity % | property |
| Unit Type Metrics | listings, DOM, avg sqft, asking/effective rent & PSF | **market-wide** trailing 1 month |
| Rents by Unit Type | audit warning only (may be filter-scoped; card unit lines preferred) | ambiguous / audit |

Subject cards are stored under `hellodata.subject*` and never approved as comps.

---

## 5. Real extracted values and counts

### 855 Providence (`855_Providence_St_-11-14-2026.pdf`)
- Report date: **11/14/2026**
- Date range: **10/15/2026 - 11/14/2026**
- Subject: **855 Providence St.** (ignored for comps); subject 2BR asking **$2,000** (sqft missing in card)
- Comparable buildings parsed: **18**
- Comps with published 2BR rent: **10**
- Comps missing 2BR (flagged `No 2 BR available`): **8**
- Market 2BR trailing 1 month: listings **28**, DOM **50**, avg sqft **952**, asking **$2,152**, PSF **$2.27**

2BR rents extracted (comps only):  
Oakland Beach $1,950; Cowesett Terrace $1,545; Franklin Woods $1,700; Pilgrim Park $1,917; Royale $2,595; Royal Crest Warwick $2,436; Villa Del Rio $2,455; Tanglewood $1,617; Shady Oaks and Pilgrim Park $2,111; Remington Pond $1,585.

### 30 Veterans (`06 HelloData report 11-08-2026.pdf`)
- Report date: **11/8/2026**
- Date range: **10/8/2026 - 11/8/2026**
- Subject: **The Residences at Bold Point** — 1BR **$2,146** / 819 sqft; 2BR **$2,688** / 823 sqft (ignored for comps)
- Comparable buildings: **4** (all with 1BR + 2BR rents)
  - Kettle Point 1BR **$2,326**
  - 135-153 Waterman 1BR **$1,788**
  - Newport Avenue Apartments 1BR **$2,222**
  - East Point Apartments 1BR **$2,291**
- Market metrics: Studio DOM 26 / $1,907; 1BR DOM **48** / $2,216; 2BR DOM 74 / $2,792

---

## 6. Matching / duplicate resolution examples

| Case | Behavior |
|------|----------|
| Exact normalized address / alias | `exact` auto-link candidate |
| Strong token overlap | `strong` / `weak` (weak needs human confirm) |
| Two comps score within 10 pts ≥ 45 | `ambiguous` — no auto `matchedId` |
| Same house #, different street | score capped; no false match |
| Subject building | never matched into comps |

---

## 7. $25 conflict examples

| Left | Right | Δ | Flag? |
|------|-------|---|-------|
| 2100 | 2125 | 25 | **No** (threshold is strict `>`) |
| 2100 | 2130 | 30 | **Yes** |
| Range 2000–2200 vs single 2300 | — | — | **Not comparable** (range preserved) |

Unresolved conflicts block those comps from draft stats until resolve/ignore.

---

## 8. Exact calculation formulas

Documented on every `computeApprovedCompStats` result (`formulas`):

1. **Monthly rent:** single value if min==max or only one side; else midpoint `(min+max)/2`; round to nearest dollar.
2. **Same-address grouping:** group by `buildingKey|addressKey|unitTypeKey`; average valid rents/sqft/DOM within group so multi-unit same-address rows count as **one** comparable. Different buildings never merge.
3. **Blended average:** arithmetic mean of grouped monthly rents with available unit-type data and `eligibleForStats !== false`.
4. **Rentometer / MLS / HelloData set averages:** same mean, filtered by source bucket.
5. **$/sqft:** `rent/sqft` only when rent>0 and sqft in `[200,5000]`; else null.
6. **Range:** min/max of grouped monthly rents.
7. **Rounding:** money `Math.round`; PSF 2 decimals.

**Unresolved business decision:** client examples do not define a special weight for match tier (Strongest/Moderate/Context) inside averages — tiers are stored/user-chosen but **not** used as numeric weights in Phase 1. Documented as unresolved rather than invented.

---

## 9. Illustrative approved-comp KPI math (from real extracts)

These figures assume **all listed HelloData comps are approved and eligible** for the named unit type. They are **not** final PKL report KPIs (no human curation / conflict resolution applied).

### Veterans 1BR (4 HelloData comps)
Rents: 2326, 1788, 2222, 2291  
**Blended average = round((2326+1788+2222+2291)/4) = $2,157**  
Range: **$1,788 – $2,326**  
Market-wide 1BR DOM from HelloData metrics (not approved-comp DOM): **48** days — kept separate from property-specific DOM.

### 855 2BR (10 HelloData comps with rent)
Sum = 19,911 → **Blended average = $1,991**  
Range: **$1,545 – $2,595**  
Market-wide 2BR asking average from Unit Type Metrics: **$2,152** (explicitly **not** substituted for approved-comp blended average).

---

## 10. UI / API changes

| Endpoint | Role |
|----------|------|
| `POST /api/uploads` | `hellodata_pdf` → persist + match summary + conflict count |
| `POST /api/uploads/[id]/reprocess` | Rentometer + HelloData; prior decisions preserved |
| `POST /api/extractions/[id]/review` | Accept HelloData comps with match tier; source-specific unit data |
| `GET /api/properties/[id]/conflicts` | List conflicts (`?status=pending`) |
| `POST /api/conflicts/[id]/resolve` | Chosen rent + note; snapshots untouched |
| `GET /api/reports/[id]/stats` | Draft KPIs; pending conflicts excluded |

Upload UI: HelloData option, badges, match tier, conflict resolve — same layout language as Task #3.

---

## 11. Security and test results

### Verification commands (this run)
| Command | Result |
|---------|--------|
| `npm test` | **PASS** (53+ tests including real-file regressions when Downloads present) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

### Security
- All new APIs use `requireAuth` + org membership / property access.
- Demo mode continues to return `503 demo_mode` for privileged upload routes (existing tests).
- Cross-tenant helpers unchanged (`assertSameOrganization`).
- Prospect PII scanner still gates client report payloads.
- No privileged browser storage of secrets; private Storage paths under `{orgId}/properties/{propertyId}/hellodata/`.

### Live authenticated Supabase E2E
**BLOCKED** — apply migration `20260317160000_task04_hellodata_conflicts.sql` (and prior Phase 1 migrations) before claiming live PASS.

---

## 12. Supabase migration requirements

Apply in order (if not already):
1. `20260317120000_phase1_foundation.sql`
2. `20260317140000_task03_source_document_pipeline.sql` (Task #3)
3. **`20260317160000_task04_hellodata_conflicts.sql`** — `source_value_conflicts`, `property_address_aliases`, RLS

Storage bucket `source-documents` must remain private.

---

## 13. Remaining blockers

1. Live org auth + migrations not exercised end-to-end in this run.
2. Some card addresses still miss city/state when HelloData concatenates city onto management lines (flagged via incomplete address; map fallback helps when available).
3. Match-tier weighting for averages unresolved by client samples (tiers stored, not weighted).
4. Phase 1 still excludes MLS/DOCX/scraping/maps/Rentometer API.

---

## 14. Recommended next engineering task

**Task #5 — MLS / listing-source ingestion + human verification gates on finalize**, or **Claude narrative draft pipeline with deterministic KPI injection** (once curated approved comps + conflict resolution are live on Supabase). Prefer finishing live migration apply + one authenticated HelloData↔Rentometer conflict walkthrough on 855 Providence before narrative work.
