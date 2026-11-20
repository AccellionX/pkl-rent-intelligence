# Task #6 — RI + CT MLS Extraction, Matching, Distances & Photos

**Overall status:** **PASS** (Google Geocoding live distances **PARTIAL / skipped** — no API key)  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk` (authorized development apply from Task #5A)  
No deploy, commit, or push.

---

## 1. Status summary

| Area | Status | Notes |
|------|--------|-------|
| Source discovery | **PASS** | Real RI + CT PDFs located and mapped |
| RI State-Wide MLS parser | **PASS** | 5 unique listings from Veterans CMA |
| CT connectMLS parser | **PASS** | 3 listings; reference values verified |
| Upload / persist / review | **PASS** | Live 201 uploads; MLS-only accept works |
| Matching (MLS id + address) | **PASS** | Exact MLS# match; no silent unit merges |
| Geocoding / Haversine | **PARTIAL** | Haversine + cache table live; Google key absent → `geocodeOk: 0` |
| Photo extraction | **PASS** | CT 3 stored; RI 57 stored (gallery-heavy; filter may need tuning) |
| Manual photo API | **PASS** | `GET/POST /api/properties/[id]/photos` |
| Migration / RLS | **PASS** | `20260317190000_task06_mls_geocode_photos.sql` applied (201) |
| Synthetic >$25 conflict tests | **PASS** | Unit coverage for MLS vs Rentometer |
| Regression | **PASS** | 78 tests; typecheck; lint; build |

---

## 2. Changed files (high level)

**Parsers / persist**
- `src/lib/extraction/mls-types.ts`
- `src/lib/extraction/mls-ri-pdf.ts`
- `src/lib/extraction/mls-ct-pdf.ts`
- `src/lib/extraction/mls-detect.ts`
- `src/lib/extraction/mls-photos.ts`
- `src/lib/extraction/persist-mls.ts`
- `src/lib/extraction/source-types.ts`, `file-validation.ts`, `matching.ts`, `types.ts`

**Geo**
- `src/lib/geo/haversine.ts`
- `src/lib/geo/geocode.ts`

**API / UI**
- `src/app/api/uploads/route.ts`, `uploads/[id]/reprocess/route.ts`
- `src/app/api/extractions/[id]/review/route.ts`
- `src/app/api/properties/[id]/photos/route.ts`
- `src/app/upload/page.tsx`

**DB / types / env**
- `supabase/migrations/20260317190000_task06_mls_geocode_photos.sql`
- `src/domain/database.types.ts`
- `.env.example`

**Tests / fixtures**
- `tests/unit/mls-parsers.test.ts`
- `tests/unit/haversine-geocode.test.ts`
- `tests/fixtures/mls/*`

---

## 3. Parser architecture

```
PDF bytes
  → dialect detect (hint or text markers: connectMLS vs NY State Alliance / Brief Summary)
  → RI or CT text parser (unpdf extractText, page-aware)
  → dedupe by MLS#
      RI: summary Active rows authoritative; gallery pages enrich only
      CT: detail Listing ID pages authoritative; summary/comparison merge only
  → optional embedded image extract (unpdf extractImages) + size/aspect filter
  → persist-mls: storage → source_documents → extracted_values (mls.listing.*)
      → matchComparableProperty (MLS# first, then address)
      → optional geocode + Haversine distance on candidates
      → optional >$25 conflict vs approved rents
      → report_photos for accepted MLS images
  → staff review accept → comparable_properties (+ mls_number) + comparable_unit_data source_type=mls
```

Unsupported fields remain `null` / empty arrays — never guessed.

---

## 4. Actual source files

| File | Role | Pages | Bytes (approx) |
|------|------|-------|----------------|
| `<LOCAL_CLIENT_SOURCE_DIR>/30 Veterans 1BR report - source files/05 RI MLS CMA report 11-01-2026.pdf` | RI State-Wide MLS CMA | 9 | ~1.1 MB |
| `<LOCAL_CLIENT_SOURCE_DIR>/Report (1).pdf` | CT connectMLS CMA | 12 | (local) |

**RI structure:** page 1 “Brief Summary of Compared Listings” (jammed columns) + photo gallery pages with `List Price` / `MLS #` headers.  
**CT structure:** subject/cover → Currently for Sale table → CMA Summary → per-listing detail (2 pages each) → comparison grid → key list. Footer marks `connectMLS`.

855 Providence package in Downloads did **not** contain an RI/CT MLS PDF in the source files folder inspected.

---

## 5. Extracted counts and values

### RI (Veterans CMA) — live + unit

| MLS# | Address | Rent | Beds | Sqft | DOM |
|------|---------|------|------|------|-----|
| 1420890 | 25 Wesleyan Avenue | 1225 | 1 | 430 | 76 |
| 1424879 | 87 Bentley Street #2 | 1350 | 1 | 455 | 31 |
| 1427444 | 173 California Avenue #BAS | 1500 | 1 | *(invalid 1 flagged)* | 2 |
| 1426731 | 22 Grape Street #2R | 1650 | 1 | 675 | 10 |
| 1414833 | 1000 Providence Place #384 | 2300 | 1 | 741 | 145 |

Live: **listingCount 5**, unique MLS ids, no summary-stat rows imported.

### CT (Report 1) — reference check **verified**

| MLS# | Address | Rent | Sqft | Beds | Unit |
|------|---------|------|------|------|------|
| 24221286 | 10 S. 3rd Avenue, Norwich CT | **1400** | **700** | **2** | **12** |
| 24215401 | 21 Treadway Avenue | **1850** | **1006** | **2** | — |
| 24216692 | 6 Beech Drive | **1900** | **985** | **2** | **5** |

Deduped across summary / detail / comparison — **exactly 3** listing extractions live.

---

## 6. Photo extraction results

| Source | Live `photoStoredCount` | Notes |
|--------|-------------------------|-------|
| CT | **3** | Sparse photos; manual upload API required and shipped |
| RI | **57** | Gallery-heavy PDF; size/aspect filter applied; may still over-accept — follow-up to tighten |

Manual path: `POST /api/properties/[id]/photos` (upload/paste sources). UI shows `Photo to be added` when `photoCount` is 0.  
No Zillow/Apartments scraping.

---

## 7. Matching / approval results

- MLS number exact match short-circuits address heuristics.
- Live CT accept created comparable `b0acd702-…` with `source_type=mls` (MLS-only comps allowed).
- Existing Rentometer/HelloData approved unit rows are not overwritten (upsert on `comparable_property_id,unit_type_id,source_type`).
- Stats engine already buckets `mls` via `mlsSetAverage`.

---

## 8. Geocoding and distance results

| Piece | Status |
|-------|--------|
| Haversine (deterministic miles) | **PASS** (unit tested) |
| `geocode_cache` table + RLS | **PASS** (migration applied) |
| Google Geocoding live | **BLOCKED / skipped** — `GOOGLE_GEOCODING_API_KEY` not in `.env` |
| Live MLS upload | `geocodeAttempted` CT=3 / RI=5, **`geocodeOk: 0`** |
| Failed/uncertain handling | Coordinates not fabricated; distance left null / flagged |

`.env.example` documents optional `GOOGLE_GEOCODING_API_KEY` (server-only).

---

## 9. Migrations and RLS

**Applied on `mqsvrastpdratvzuouxk`:** `20260317190000_task06_mls_geocode_photos.sql`

- `comparable_properties.mls_number` + index  
- `geocode_cache` (authenticated select/insert/update; service_role full)  
- `report_photos` provenance: `source_document_id`, `sort_order`, `content_sha256`, `width`, `height`  
- `NOTIFY pgrst, 'reload schema'`

Forward-only; no edits to previously applied migration files for production behavior changes.

---

## 10. Live Supabase E2E

Against running `npm run dev` + ephemeral Task #5 user:

| Step | Result |
|------|--------|
| Org / property / 2BR unit type | 201 |
| CT MLS upload | 201 · 3 listings · 3 photos |
| RI MLS upload | 201 · 5 listings · 57 photos |
| Accept CT listing | 200 · comparable created |
| Google distances | skipped (no key) |

---

## 11. Synthetic conflict-resolution tests

`tests/unit/mls-parsers.test.ts`:
- MLS vs Rentometer $100 gap → flags (`>$25`)
- Exact $25 delta → does **not** flag  
Persist path inserts `source_value_conflicts` with side-by-side `left_value` / `right_value` when live approved peers exist.

---

## 12. Regression

```text
npm test       → 78 passed (18 files)
npm run typecheck → pass
npm run lint      → pass
npm run build     → pass
```

---

## 13. Remaining blockers / follow-ups

1. **Google Geocoding API key** required for live distance PASS.  
2. **RI photo over-capture** — tighten gallery filters / per-listing page association.  
3. No natural dual-source >$25 MLS conflict in this live run (no prior approved peer on new org).  
4. Crop UI for 3:2 still schema-ready (`crop_metadata`); dedicated crop control not redesigned into dashboard.

---

## 14. Recommended next task

1. Configure `GOOGLE_GEOCODING_API_KEY` and verify cached distances on CT comps.  
2. Narrative / Claude draft pipeline with deterministic KPI injection **or** Zillow/Apartments xlsx ingestion.  
3. Tighten MLS photo heuristics and add signed photo preview URLs in review UI.
