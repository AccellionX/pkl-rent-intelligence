# Task #10 — Branded PDF Generation & 855 Providence Reference Matching

**Overall status:** **PARTIAL**  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk`  

Server-side branded PDF generation from `assembleReportPayload` is implemented (jsPDF default; optional Playwright). Draft PDFs, finalization guards, private `generated-reports` storage, and live E2E all pass. **855 visual acceptance is BLOCKED** — reference PDF exists and was inspected, but the live 855 assembly still has **zero eligible approved comps**, so a 13-page content match cannot and must not be forced. No fabricated visual parity.

---

## Axis results (required)

| Axis | Result |
|------|--------|
| Renderer | **PASS** |
| 855 reference matching | **BLOCKED** |
| 30 Veterans regression | **PARTIAL** |
| Finalization controls | **PASS** |
| Secure PDF storage | **PASS** |
| Live integration | **PASS** |

---

## 1. Implementation status

| Area | Result |
|------|--------|
| Reuse `assembleReportPayload` only (no template calc) | **PASS** |
| Letter page size (612×792) matching reference | **PASS** |
| jsPDF serverless-safe default renderer | **PASS** |
| HTML template for Playwright / Railway worker | **PASS** (optional) |
| Draft PDF with visible DRAFT / INCOMPLETE | **PASS** (unit + live) |
| Final blocked when 0 approved comps | **PASS** (unit + live) — never auto-approved |
| Snapshot-backed finalize path | **PASS** (code + blocked on live 855) |
| Private `generated-reports` upload + signed download | **PASS** (live draft store) |
| Org-scoped auth / cross-tenant deny | **PASS** (404) |
| PII scrub / client PDF exclusion | **PASS** |
| Escape unsafe narrative HTML in HTML path | **PASS** |
| Charts / photo binary embedding at print quality | **PARTIAL** — placeholders + paths; no Playwright visual parity |
| Exact 855 13-page layout / fonts / photo grids | **BLOCKED** |
| DOCX export / public owner URLs / maps / Drive | **Out of scope** (not implemented) |

---

## 2. Changed files (Task #10)

**Core PDF**
- `src/lib/pdf/brand.ts`
- `src/lib/pdf/finalization.ts`
- `src/lib/pdf/format.ts`
- `src/lib/pdf/html-template.ts`
- `src/lib/pdf/jspdf-renderer.ts`
- `src/lib/pdf/playwright-renderer.ts`
- `src/lib/pdf/render.ts`
- `src/lib/pdf/storage.ts`
- `src/lib/pdf/index.ts`

**API**
- `src/app/api/reports/[id]/pdf/route.ts` — GET status / POST draft|final preview
- `src/app/api/reports/[id]/pdf/finalize/route.ts` — snapshot-backed final + store
- `src/app/api/reports/[id]/pdf/download/route.ts` — authenticated signed URL

**UI**
- `src/components/buildings/live-pdf-reports.tsx`
- `src/app/buildings/[id]/reports/page.tsx` (live UUID → live PDF panel; demo isolated)

**Tests / scripts / config**
- `tests/unit/pdf-generation.test.ts`
- `scripts/task10-pdf-live-e2e.mjs`
- `package.json` (`jspdf`, `jspdf-autotable`, `task10:e2e`)
- `.env.example` (`PDF_RENDERER`)

**This report**
- `docs/phase1/TASK_10_PDF_GENERATION_REPORT.md`

---

## 3. Renderer architecture

```
CanonicalReportPayload (assembleReportPayload)
        │
        ├─ assertNoClientProspectPii
        ├─ evaluatePdfFinalization / assertCanRenderPdf
        │
        ├─ buildReportHtml()  ──► preview / Playwright input
        │
        └─ PDF_RENDERER?
              ├─ (default) renderReportPdfWithJsPdf  → Uint8Array  [Vercel-safe]
              └─ playwright → Chromium page.pdf     [local / Railway worker only]
```

**Deployment note:** Playwright/Chromium is **not** assumed on Vercel. Default is jsPDF. For closer HTML/CSS fidelity, run a minimal Railway (or similar) worker with `PDF_RENDERER=playwright` + Playwright browsers installed, calling the same `buildReportHtml` + payload. The Next app can keep generating drafts via jsPDF and optionally hand off finals to the worker.

**Data integrity rules enforced**
- No independent rent math in the template — only payload fields.
- No hardcoded demo comps in live authenticated reports.
- Final mode requires: manual PKL range, ≥1 eligible approved comp group, approved non-stale narrative, no pending conflicts.
- Draft may render incomplete data with a clear DRAFT / INCOMPLETE banner + footer.

---

## 4. Reference PDF inventory

| Asset | Location | Notes |
|-------|----------|-------|
| **855 branded PDF (primary)** | `<LOCAL_CLIENT_SOURCE_DIR>/855 Providence St - 2BR Report Package/1 Report/855 Providence Street - 2 Bedroom Rental Pricing Analysis.pdf` | **13 pages**, US **Letter** 612×792, LibreOffice Writer → PDF |
| 855 DOCX / HTML siblings | same `1 Report/` folder | Design source companions |
| 855 package sources | `…/3 Source files/` | MLS / HelloData / weekly inputs — not the branded output |
| **30 Veterans DOCX** | `references/30-veterans-pricing-report.docx` | Secondary workflow reference |
| **30 Veterans Aug 2026 PDF** | `<LOCAL_CLIENT_SOURCE_DIR>/30 Veterans 1BR report - source files/01 PKL manual rent comp report (Aug 2026).pdf` | **5 pages**, Letter; older manual rent-comp style (not the 855 13-page template) |

### 855 actual section ordering (inspected)

| Pages | Content |
|-------|---------|
| 1 | Title “Rental Pricing Analysis”, subject building details, amenities, listing links, available unit |
| 2 | “Our recommendation” ($1,925–$2,000), approved narrative, market / source-set discussion |
| 3 | “The comparables side by side” table |
| 4–7 | Strongest-match comp cards (photos / placeholders, notes) |
| 8–10 | Moderate-match comp cards |
| 11 | Context-only comp card |
| 12 | Reviewed and excluded; methodology / weekly Zillow & Apartments stats |
| 13 | Tours & prospect feedback; next actions; sources / footnotes |

Headers/footers: PKL branding, property/unit context, page numbers. Comp photo slots often show “Photo from live listing to be added”. Colors: navy + gold brand system (aligned with existing demo UI tokens in `PDF_BRAND`).

### Differences vs 30 Veterans Aug 2026 PDF

- Veterans is a **shorter (5-page)** manual “Rent Comparable Analysis”, not the 855 multi-tier card layout.
- Veterans emphasizes 1BR comps + summary table; fewer narrative/weekly/tour sections.
- Phase 1 scope treats **855 structure as authoritative** for the branded pipeline; Veterans is regression for data wiring / demo fixture only.

---

## 5. Actual page count and visual comparison

| Document | Pages | Visual verdict |
|----------|-------|----------------|
| 855 reference PDF | 13 | Inspected (text + page size) |
| Live 855 **draft** from E2E (0 approved comps) | **2** | Expected incomplete; DRAFT labeled |
| Full 855 visual parity | — | **BLOCKED** — cannot claim match |

**Observed differences (honest, not parity):**
- Live draft lacks the multi-page strongest/moderate/context card sequence because **eligibleGroupedCount = 0**.
- jsPDF uses Helvetica; reference uses Writer/LibreOffice fonts — not pixel-identical.
- Subject/comp photography is path/placeholder-based; reference embeds cropped photo grids.
- Chart rendering is KPI/source-average text from payload, not a plotted comparable-range graphic matching the Word export.
- Pagination will expand toward ~13 pages only when approved comps + narrative + weekly content mirror the reference dataset — **not** by truncating or hardcoding page count.

---

## 6. Report sections implemented

Driven by `PDF_SECTION_ORDER` / jsPDF + HTML templates:

1. Branded title / header (PKL Management LLC navy/gold)
2. Subject building details, amenities, listing links, available units
3. PKL-approved recommended rent range (manual fields only)
4. Key pricing figures + **source-specific** averages (Rentometer / HelloData / MLS)
5. Editable/approved narrative text
6. Side-by-side comparable table (approved included only)
7. Comp highlight cards by match tier (strongest / moderate / context) with notes + photo placeholders
8. Methodology + reviewed/excluded candidates
9. Weekly Zillow + Apartments.com metrics, agent narrative, tours / next actions
10. Sources / dates / footnotes; page footers

Missing vs polished 855 print: embedded 3:2 crop images, true chart graphics, Writer-exact spacing — deferred until comps exist + optional Playwright worker.

---

## 7. Data accuracy checks

| Check | Result |
|-------|--------|
| Payload-only figures (no template calc) | Pass |
| Approved comps only in table/cards | Pass |
| Missing values shown as `—` / honest empty states | Pass |
| Source-set averages distinct from blended | Pass (labels in PDF) |
| PKL range from human-approved report fields | Pass |
| Unresolved conflicts block final | Pass (finalization rule) |
| Live 855 zero comps not bypassed | Pass (E2E blocker) |

---

## 8. Draft / final behavior

| Mode | Behavior |
|------|----------|
| `POST /api/reports/[id]/pdf` `mode=draft` | Always allowed when org-authorized; DRAFT banner; optional `store=true` |
| `mode=final` on same route | Rejected when `evaluatePdfFinalization` fails |
| `POST …/pdf/finalize` | Requires live readiness + immutable snapshot payload; stores final PDF; attaches `generated_file_*` on snapshot; **does not** set `saved_to_drive` |
| Download | Authenticated signed URL from private bucket only |

---

## 9. Private storage results

- Bucket: `generated-reports` (existing foundation; **private**)
- Path pattern: `{organizationId}/reports/{reportRunId}/{mode}-v{version}-{stamp}.pdf`
- Live E2E draft upload: **stored: true**
- Cross-tenant PDF POST: **404**
- No public owner report URLs

---

## 10. E2E results

Command: `npm run task10:e2e` (dev server live mode)

| Step | Result |
|------|--------|
| Health live | ok |
| Create 855 report + set $1,925–$2,000 | ok |
| Deterministic narrative generate + approve | ok (no live Claude claim) |
| PDF status `finalization.ok === false` | ok — blocker: no eligible approved comps |
| Draft PDF render (jspdf, 2 pages, DRAFT, 855 text) | ok |
| Draft stored in private bucket | ok |
| Finalize blocked (400) | ok |
| Unauthorized other user | 404 |

`visualParity: not_claimed`

---

## 11. Test / gate results

| Command | Result |
|---------|--------|
| `npm test` | **105 passed** / 22 files |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |
| `npm run task10:e2e` | **PASS** |

---

## 12. Remaining blockers

1. **855 visual acceptance** — need human-approved eligible comps (and photos) on the live property; do **not** auto-approve.
2. Optional **Playwright Railway worker** for closer HTML/CSS/print fidelity vs jsPDF Helvetica layout.
3. Wire **signed photo bytes** (3:2 crops from `report-photos`) into renderer `photoDataUrls` for print-quality cards.
4. Comparable **range chart** graphic parity with Word reference.
5. Task #09 narrative migration `20260317210000` still **not applied** (deterministic narrative path used).
6. No commit / push / deploy performed (per task scope).

---

## 13. Recommended Task #11

**Approve real 855 comps → snapshot → final PDF visual QA loop**

1. Agent review UI to approve/exclude comps with match tiers (no auto-approve).
2. Attach approved subject/comp photos with 3:2 crops into PDF cards.
3. Produce snapshot-backed final PDF; side-by-side page screenshots vs the 13-page reference; file a diff list.
4. Optionally stand up Railway Playwright worker behind `PDF_RENDERER=playwright`.
5. Veterans live regression once a 1BR report run has approved comps.
6. Google Drive upload only after visual acceptance (do not mark `saved_to_drive` early).
