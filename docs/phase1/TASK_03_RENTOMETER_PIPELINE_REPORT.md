# Task #3 — Real File Upload & Rentometer Extraction Report

**Status:** **PARTIAL**  
**Date:** 2026-11-17  

| Layer | Result |
|-------|--------|
| Parsers (CSV / XLSX / PDF text) | **PASS** (synthetic + real local files) |
| Upload / review APIs (code + demo-mode auth gates) | **PASS** |
| UI dual-mode upload/review | **PASS** (demo preserved; live wired) |
| Live Supabase end-to-end (auth session → storage → DB) | **BLOCKED** — migrations not verified against a live project in this run; no authenticated E2E claimed |

No deploy, commit, or push. Raw client files were **not** copied into the repository.

---

## 1. Exact files changed / added

### Added
- `supabase/migrations/20260317140000_task03_source_document_pipeline.sql`
- `src/lib/extraction/**` — normalize, file validation, tabular/PDF parsers, persist, hash, status map
- `src/app/api/uploads/route.ts`
- `src/app/api/uploads/[id]/reprocess/route.ts`
- `src/app/api/documents/[id]/extractions/route.ts`
- `src/app/api/extractions/[id]/review/route.ts`
- `src/app/api/properties/[id]/documents/route.ts`
- `src/domain/extraction-schemas.ts`
- `tests/fixtures/rentometer/synthetic-2bed.csv`
- `tests/fixtures/rentometer/synthetic-reordered.csv`
- `tests/unit/rentometer-tabular.test.ts`
- `tests/unit/rentometer-pdf.test.ts`
- `tests/unit/file-validation.test.ts`
- `tests/unit/upload-api-demo.test.ts`
- `docs/phase1/TASK_03_RENTOMETER_PIPELINE_REPORT.md`

### Changed
- `src/app/upload/page.tsx` — live/demo dual mode; source-type + review actions (same layout language)
- `src/domain/database.types.ts` — `source_documents`, `extracted_values`, `review_decisions` (+ Task #3 columns)
- `package.json` / lockfile — `unpdf`
- `README.md`, `.env.example`

### Untouched (intentionally)
- Demo store / Veterans seed / jsPDF generator / generic client `parse-upload.ts` (still used by demo mode)

---

## 2. End-to-end data flow

```
Authenticated user (live mode)
  → POST /api/uploads (multipart: file, sourceType, organizationId, propertyId, optional reportRunId/unitTypeId)
  → validate extension + magic bytes + size + org/property membership
  → private Storage path: {orgId}/properties/{propertyId}/rentometer/{ts}-{safeName}
  → source_documents row (parse_status=parsing → needs_review|failed)
  → Rentometer parser (CSV/XLSX/PDF)
  → extracted_values rows (pending) with raw + normalized provenance
  → UI review table
  → POST /api/extractions/[id]/review (accepted|rejected|overridden + reason)
  → append-only review_decisions
  → only on accept/override + unitTypeId: property-level comparable_properties + approved comparable_unit_data

Reprocess:
  POST /api/uploads/[id]/reprocess
  → new document + new pending extractions
  → prior document.superseded_by set
  → prior accepted/overridden decisions NOT overwritten
```

Demo mode: existing client parse path; live upload APIs return `503 demo_mode`.

---

## 3. Database / storage changes

Migration `20260317140000_task03_source_document_pipeline.sql` adds to `source_documents`:

- `external_report_id`, `content_sha256`, `parser_version`
- `warnings` jsonb, `summary_metrics` jsonb
- `superseded_by`, `unit_type_id`

Still uses private bucket `source-documents` (no public URLs).

---

## 4. Actual input formats tested

### Located on disk (not committed)

| File | Path |
|------|------|
| 855 Rentometer CSV | `<LOCAL_CLIENT_SOURCE_DIR>/855 Providence St - 2BR Report Package/3 Source files/20261114-Rentometer-855_Providence_St_West_Warwick_RI_02893_USA-2-bed-qPiKWT24DL0.csv` |
| 855 Rentometer PDF | same folder, `.pdf` |
| Veterans Rentometer PDF | `<LOCAL_CLIENT_SOURCE_DIR>/20260922-Rentometer-30_Veterans_Memorial_Pkwy_East_Providence_RI_02914_USA-1-bed-srzslZYgfVs.pdf` |

### In-repo fixtures
- `tests/fixtures/rentometer/synthetic-2bed.csv` (fake addresses)
- `tests/fixtures/rentometer/synthetic-reordered.csv`

---

## 5. Parser field mapping

Rentometer tabular headers → normalized fields:

| Source header examples | Field |
|------------------------|-------|
| `address`, `Street Address` | address (normalized parts) |
| `distance (mi)`, `Miles` | distanceMiles |
| `price`, `Asking Rent` | rent (currency-safe) |
| `size (sqft)`, `Square Feet` | sqft |
| `$/sqft` | psf |
| `bedrooms`, `Beds` | beds |
| `baths` / `1ba` | baths |
| `property type`, `Building Type` | propertyType |
| `list date`, `Last Seen` | listDate |
| `outlier` | outlier boolean |

PDF summary (deterministic text regex via `unpdf`, **no AI math**):

- Report ID, generated date, sample size, average/mean, median, 25th/75th, min/max, stddev, radius, bedroom filter  
- Listing table rows stored as **supplemental** (`includeAsCompCandidate=false`)

---

## 6. Real extraction results (local machine)

### 855 CSV (`qPiKWT24DL0`) — **PASS locally**
- Report id from filename: `qPiKWT24DL0`
- Rows parsed: 22–23 (trailing newline variance)
- Subject row detected for `855 Providence St…`
- Same-address rows preserved: `35 Old Carriage` ×2, `444 Meshanticut` ×5
- Blank rows flagged; missing sqft flagged; suspicious `92` sqft flagged
- Spot check: `303 Greenwich Ave` → rent `2480`, sqft `1040`, beds `2`, baths `1`

### 855 PDF — **PASS locally**
- Report ID `qPiKWT24DL0` (matches CSV)
- Sample size `21`, average `2033`, median `2085`, 25th `1833`, 75th `2232`
- Supplemental listings not marked as approved-comp candidates

### Veterans PDF — **PASS locally** (summary extract; layout not claimed universal)

### Live Supabase upload of these files — **BLOCKED / not claimed**
Requires applied migrations + authenticated staff session against the project.

---

## 7. Review & approval behavior

- All tabular candidates land as `review_status=pending`
- Subject / blank / invalid rows kept for audit; subject & blank are not auto comp candidates
- Accept/reject/override records append-only `review_decisions`
- Reprocess creates a new document; prior approvals are not silently overwritten; matching addresses get uncertainty notes
- Accepting with `unitTypeId` creates/updates **property-level** `comparable_properties` and `comparable_unit_data` (`status=approved`, `source_type=rentometer`)
- Unreviewed candidates do **not** update recommendation/KPI fields

---

## 8. Authorization / security tests

| Case | Result |
|------|--------|
| Upload in demo mode | `503 demo_mode` (no seed fallback) |
| Review in demo mode | `503 demo_mode` |
| Wrong file type / `..` filename | validation rejects |
| Service role never in browser client | unchanged (`server-only` admin module) |
| Cross-tenant live RLS | SQL policies from Task #2; **not live-proved** here |

---

## 9. Commands and results

| Command | Result |
|---------|--------|
| `npm test` | **PASS** — 9 files, 37 tests (includes real 855 CSV/PDF when present on disk) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** (new upload/review API routes listed) |

---

## 10. Blockers

1. **Live E2E** against Supabase (apply both migrations, create org/property/unit type, sign-in, upload) not executed/claimed in this task.  
2. Client sample packs live under **Downloads**, not `references/` — tests auto-detect absolute paths / env overrides; do not commit those files.  
3. PDF listing regex is tuned to observed Rentometer text layout; other PDF generators may need fixtures before claiming broad coverage.  
4. No auth UI yet — live upload page expects org/property UUIDs + session cookies.

---

## 11. Recommended Task #4

**HelloData PDF enrichment + $25 Rentometer↔HelloData rent conflict flags**, wiring overlapping comps into review without auto-approving, then begin deterministic approved-comp statistics (same-address averaging) once curated reviews exist.

---

## Acceptance checklist (Task #3)

| Requirement | Status |
|-------------|--------|
| Authorized upload API + source-type selection | Implemented |
| Rentometer CSV/XLSX/PDF intake | Implemented |
| Validation (type/size/association) | Implemented |
| Private storage + metadata/parser state | Implemented |
| Reprocess without duplicate silent approvals | Implemented |
| Tabular mapping + provenance + no invented fields | Implemented + tested |
| PDF summary vs supplemental listings | Implemented + tested on real 855 PDF |
| Review UI on existing upload page | Implemented (live mode) |
| Unreviewed candidates do not change pricing | Enforced by design |
| Real-file tests without committing client data | PASS locally via Downloads paths |
| Live Supabase E2E | **BLOCKED / not claimed** |
