# Task #7 — Complete MLS Integration

**Overall status:** **PARTIAL** (live RI/CT extraction, review, matching, photos, RLS, and synthetic conflict **PASS**; Google Geocoding distances **BLOCKED** — no API key)  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk`  
No deploy, commit, push, or destructive migrations.

---

## 1. What already existed (Task #6)

Inspected and **preserved** (no reimplementation):

| Area | Location | Status before #7 |
|------|----------|------------------|
| RI State-Wide parser | `src/lib/extraction/mls-ri-pdf.ts` | Working vs Veterans CMA |
| CT connectMLS parser | `src/lib/extraction/mls-ct-pdf.ts` | Working; reference values tested |
| Dialect detect | `src/lib/extraction/mls-detect.ts` | RI vs CT |
| Persist / match / conflict | `src/lib/extraction/persist-mls.ts`, `matching.ts` | MLS# first; candidates until approve |
| Upload / reprocess APIs | `src/app/api/uploads/**` | `mls_ri_pdf` / `mls_ct_pdf` |
| Review accept → MLS comps | `src/app/api/extractions/[id]/review/route.ts` | MLS-only comps; no overwrite of other `source_type` |
| Photos extract + manual API | `mls-photos.ts`, `properties/[id]/photos` | Private `report-photos` |
| Geocode + Haversine | `src/lib/geo/*`, `geocode_cache` | Code ready; key absent |
| Upload UI source select | `src/app/upload/page.tsx` | RI/CT options + photo placeholder label |
| Schema | migration `20260317190000` | Already recorded (Task #6B) |
| Unit tests | `tests/unit/mls-parsers.test.ts` | Real-PDF regressions |

---

## 2. What was implemented in Task #7

| Change | Why |
|--------|-----|
| Primary photo cap (max **4**/listing, prefer **3:2**) in `mls-photos.ts` | RI gallery flooded storage (~57); keep property shots, drop banners/surplus |
| Stricter size/aspect filters | Reject header banners / icons |
| Optional `cropMetadata` on `POST /api/properties/[id]/photos` | Support 3:2 crop without dashboard redesign |
| `scripts/task07-mls-live-e2e.mjs` + `npm run task07:e2e` | Authenticated live RI+CT E2E harness |
| Extra unit tests (cap + real-PDF photo attach) | Regression for gallery flood |

No new migrations. No dashboard redesign. Working parsers/APIs reused.

---

## 3. Real-file extraction results

**Sources (local only; not committed):**

- RI: `…/05 RI MLS CMA report 11-01-2026.pdf`
- CT: `…/Report (1).pdf`

### CT reference check (confirmed from actual PDF via parser)

| Listing | Rent | Sqft | Beds | Unit |
|---------|------|------|------|------|
| 10 S. 3rd Avenue (MLS `24221286`) | **1400** | **700** | 2 | **12** |
| 21 Treadway Avenue (MLS `24215401`) | **1850** | **1006** | 2 | — |
| 6 Beech Drive (MLS `24216692`) | **1900** | **985** | 2 | **5** |

Exactly **3** listings after summary/detail/comparison dedupe. Page-level provenance on detail pages. Uncertain fields left null (not guessed).

### RI Veterans CMA

**5** unique MLS listings; summary Active rows authoritative; gallery pages enrich identity only (no duplicate rows). Invalid sqft on California Ave flagged, not confirmed.

---

## 4. Live E2E results (`npm run task07:e2e`)

Against `npm run dev` + ephemeral Task #5 user on `mqsvrastpdratvzuouxk`:

| Step | Result |
|------|--------|
| Auth + org bootstrap | Pass |
| Cross-tenant RLS | **Pass** (`otherSeesOrg: 0`) |
| CT PDF upload | **201** · listings **3** · photos **3** · `needs_review` |
| RI PDF upload | **201** · listings **5** · photos **20** (≤ 5×4 cap) |
| Reload CT extractions | 3 rows; reference rents/sqft/units match |
| Accept `24221286` | **200** · comparable `f43b7959-…` · `source_type=mls` · rent 1400 |
| CT re-upload match | **exact: 1** on approved MLS#; others none |
| Synthetic >$25 conflict resolve | **200** |
| Public photo URL probe | **400** (private) |
| Manual photo + 3:2 crop metadata | **201** |
| Geocode | Attempted CT=3 / RI=5 · **`geocodeOk: 0`** (no key) |

Harness exit: **`pass_geocode_skipped`** (exit 0).

---

## 5. Image extraction results

| Source | Before #7 | After #7 |
|--------|-----------|----------|
| CT detail pages | 3 property images | **3** stored (1 per listing) |
| RI galleries | ~57 stored | **20** stored (≤4 per listing; banners rejected) |
| Missing CT photos | UI `Photo to be added` | Unchanged; manual/placeholder upload works |

---

## 6. Geocoding status

| Piece | Status |
|-------|--------|
| Haversine miles | Implemented + unit tested |
| `geocode_cache` | Live |
| `GOOGLE_GEOCODING_API_KEY` | **Absent** in `.env` |
| Live distances | **Not fabricated** · left null / flagged |

**Blocker for full distance PASS:** configure server-only `GOOGLE_GEOCODING_API_KEY` (documented in `.env.example`).

---

## 7. Security checks

| Check | Result |
|-------|--------|
| Auth required for upload/review/photos | Pass |
| Tenant RLS (second user) | Pass |
| Private buckets (`source-documents`, `report-photos`, `generated-reports`) | Pass |
| Public object probe | Not 200 |
| Client sample PDFs | Not committed |

---

## 8. Test outcomes

```text
npm test       → 80 passed (18 files)
npm run typecheck → pass
npm run lint      → pass
npm run build     → pass
npm run task07:e2e → pass_geocode_skipped (exit 0)
```

---

## 9. Remaining blockers

1. **Google Geocoding API key** — required for live straight-line miles on MLS comps.  
2. Dedicated 3:2 crop **UI control** still deferred (API/schema ready; no dashboard redesign this task).  
3. Natural dual-source MLS↔Rentometer conflict still rare on brand-new orgs (synthetic resolve exercised).

---

## 10. Recommended next task

1. Add `GOOGLE_GEOCODING_API_KEY` and re-run `task07:e2e` to confirm cached distances.  
2. Claude / narrative draft with deterministic KPI injection from approved comps, **or** Zillow/Apartments workbook ingestion.  
3. Optional signed photo preview in review UI (still private storage).

---

## Safety log

| Rule | Honored |
|------|---------|
| Phase 1 only | Yes |
| No dashboard redesign | Yes |
| No destructive migrations / db reset / push | Yes |
| No deploy / commit / push | Yes |
| No secret logging | Yes |
| No reimplementation of working MLS core | Yes |
| No PASS claim without real-file + live validation | Live+real-file done; overall **PARTIAL** due to geocode key |
