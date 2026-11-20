# PKL Rent Intelligence — Existing Codebase Audit (Phase 1)

**Audit date:** 2026-11-17  
**Deployed reference (UI only):** https://pkl-rent-intelligence.vercel.app/  
**Repo inspected:** `<REPO_ROOT>`  
**Mode:** Audit only — no code changes, installs, or deployments performed.

### Specification authority used for this audit

- **Provisional Phase 1 requirements** were taken from the audit prompt (property/unit-type workspace, source uploads, extraction + human verification, deterministic comps math, Claude narrative drafts, branded PDF, weekly history, Google Drive, privacy rules).
- Client PDFs, source ZIPs, signed scope (`PKL_Phase1_Scope_SignOff.pdf`), and Claude build logs are **not present** in this repository and were **not inspected**.
- Anything that requires those sample files is marked **Pending sample-file validation**.
- Exact contract milestone names/dates from the signed PDF are **Pending sample-file validation**; this document uses provisional Milestone A/B/C slices aligned to Phase 1 delivery order.

---

## 1. Executive technical summary

The repository is a **polished Next.js 16 client-side demo**, not a Phase 1 production reporting system. It ships a branded App Router UI, a synthetic ~120-building portfolio, and a deep-dive workflow hard-gated to **30 Veterans Memorial Parkway** with static comps, narrative, leads, and recommendation figures ported into TypeScript from `references/30-veterans-pricing-report.docx`.

| Layer | Reality |
|-------|---------|
| Persistence | Zustand + `localStorage` key `pkl-rent-intelligence-demo` (`src/store/demo-store.ts`) |
| Database | **None** |
| API routes | **None** (`src/app/api/**` does not exist) |
| Auth / middleware | **None** |
| Paid AI / OCR / Drive / MLS APIs | **None** (explicitly labeled in README and Settings) |
| Tests | **None** |

**What is real today:** UI shell and navigation; portfolio browse/filter on seeded data; Veterans comps selection + pricing band edits; CSV/Excel **browser** parsing; jsPDF **local download** of a short branded pricing PDF; local report/schedule/upload metadata.

**What is not Phase 1–ready:** multi-property/unit-type report workspace; Rentometer/HelloData/MLS/Zillow/Apartments schema-aware extraction; human conflict resolution ($25 rent flags); deterministic stats engine (same-address averaging, invalid-measurement exclusion, geocoded MLS distance); Claude narrative pipeline; photo upload/crop/reuse; 13-page acceptance PDF layout for **855 Providence Street 2BR**; Google Drive folder save; privacy scrubbing; weekly snapshot/trend engine; server-side security/isolation.

**Preserve:** App shell, PKL visual language, Veterans seed as a regression fixture, CSV/XLSX parse scaffolding, jsPDF branding primitives, Zustand interaction patterns — rebuild the product pipeline underneath, do not start from a blank UI.

---

## 2. Existing architecture

```
Browser (Next.js App Router, React 19)
├── Pages (src/app/**) — "use client" heavy
├── UI (src/components/**) — Radix/shadcn-style + Recharts
├── Seed data (src/data/veterans.ts, portfolio-seed.ts, types.ts)
├── Demo store (src/store/demo-store.ts) → localStorage
└── Client libs
    ├── parse-upload.ts  (Papa Parse + SheetJS; PDF stub)
    └── pdf-report.ts    (jsPDF + jspdf-autotable → doc.save)
```

**Stack evidence** (`package.json`):

- Runtime: `next@16.4.6`, `react@19.3.0`, TypeScript, Tailwind 4
- UI: Radix primitives, Lucide, Recharts, Sonner
- Files: `papaparse`, `xlsx`, `jspdf`, `jspdf-autotable`
- State: `zustand`
- Present but unused in `src/`: `zod`
- **Absent:** Anthropic/OpenAI SDKs, Google APIs, Prisma/Drizzle, auth libraries, PDF text extractors (`pdf-parse`, `pdfjs`), image crop libraries, geocoding SDKs

**Config:**

- `vercel.json` — framework Next.js + `npm run build` only
- `next.config.ts` — Turbopack CSS + Unsplash remote images; no security headers
- README states: “no auth, no database, no paid APIs” and “no environment variables required”
- `.gitignore` ignores `.env*` (no env templates or secrets in repo)

**Data sources:**

| Source | Role |
|--------|------|
| `src/data/veterans.ts` | Featured property, 9 comps, exclusions, recommendation, leads, reportMeta |
| `src/data/portfolio-seed.ts` | Deterministic PRNG → 119 synthetic buildings + Veterans |
| `references/30-veterans-pricing-report.docx` | Offline source for hand-ported figures (not loaded at runtime) |
| `public/samples/comps-sample.csv` | Demo CSV rows |
| Deployed Vercel app | Same demo UI surface |

**855 Providence Street** does not appear anywhere in application code. Acceptance layout for that 13-page report is **Missing** / **Pending sample-file validation**.

---

## 3. Page / route inventory

| Route | File | Purpose | Implementation status |
|-------|------|---------|----------------------|
| `/` | `src/app/page.tsx` | Portfolio dashboard, featured Veterans CTA, seed stats | Mocked portfolio + Partial local report list |
| `/buildings` | `src/app/buildings/page.tsx` | Search/filter/sort buildings | Working UI on Mocked seed |
| `/buildings/[id]` | `src/app/buildings/[id]/page.tsx` | Property overview / units / amenities | Partial — seed always; deep links only for Veterans |
| `/buildings/[id]/comparables` | `.../comparables/page.tsx` | Comp cards, selection, charts | Mocked static comps; gated to Veterans (`id !== VETERANS_BUILDING_ID` empty state, lines 62–78) |
| `/buildings/[id]/pricing` | `.../pricing/page.tsx` | Asking rents + recommendation band + charts | Partial local edits on Veterans seed |
| `/buildings/[id]/leads` | `.../leads/page.tsx` | Zillow / Apartments weekly metrics | Mocked (`veteransLeads`) |
| `/buildings/[id]/reports` | `.../reports/page.tsx` | Generate branded PDF + building history | Working client PDF for Veterans; history Partial (localStorage) |
| `/units` | `src/app/units/page.tsx` | Cross-portfolio units (capped 250) | Mocked seed + rent overrides |
| `/reports` | `src/app/reports/page.tsx` | Global report history | Partial localStorage |
| `/reports/schedule` | `src/app/reports/schedule/page.tsx` | Weekly / twice-monthly schedules | Mocked — toast “emails are not sent” (lines 67–69) |
| `/upload` | `src/app/upload/page.tsx` | Document upload / extraction UI | Partial CSV/XLSX; Mocked PDF AI |
| `/settings` | `src/app/settings/page.tsx` | Demo inventory + reset | Working demo controls |
| Layout shell | `src/app/layout.tsx` + `src/components/layout/*` | Sidebar, topbar, AppShell | Working presentational |

**Sidebar nav** (`src/components/layout/sidebar.tsx` lines 18–31): Portfolio, Buildings, Units, 30 Veterans shortcut, Report History, Scheduling, AI Upload, Demo Settings.

**API routes:** none.  
**Server Actions / middleware:** none found.

---

## 4. Feature matrix (Phase 1 vs current code)

Legend: **Working** · **Partial** · **Mocked** · **Missing** · **Broken**

| Phase 1 requirement | Status | Evidence |
|---------------------|--------|----------|
| Property / unit-type workspace | Partial / Missing | Property pages exist; **no unit-type dimension** in types; workflow Veterans-only |
| Report history / statuses | Partial | `GeneratedReport.status`: `generated` \| `scheduled` \| `draft` (`types.ts` 5); history is local metadata only, no PDF blob retention |
| Rentometer CSV/Excel upload (curated comps) | Partial | Generic CSV/XLSX parse; **no Rentometer schema**, no “PDF extras ≠ approved comps” rule |
| Rentometer summary PDF | Mocked | `simulatePdfExtraction` hardcodes Veterans fields (`parse-upload.ts` 106–149) |
| HelloData PDF extraction / enrichment | Missing | Source string labels only (`veterans.ts` `source: "HelloData"`) |
| RI State-Wide MLS PDF | Missing | Mentions in `reportMeta.sources` / UI copy; no parser |
| CT connectMLS / SmartMLS PDF | Missing | `reportMeta.sources` mentions SmartMLS (CT); no layout-specific parser — **Pending sample-file validation** for connectMLS vs SmartMLS naming |
| Zillow XLSX | Partial | First-sheet generic XLSX only; no multi-sheet / vendor mapping |
| Apartments.com XLSX | Partial | Same as Zillow |
| Photos (upload, paste, 3:2 crop, MLS extract, prior-week reuse) | Missing | Unsplash URLs only; README admits placeholders |
| AI-assisted extraction | Mocked | PDF stub; UI badges “No paid OCR / LLM APIs” (`upload/page.tsx` 138–140) |
| Editable data review / human verification | Partial | Comp checkboxes + rent/band edits; no field-level conflict workspace |
| Approved comp management (fixed buildings across unit types; notes on adds) | Partial / Missing | Toggle comps for Veterans; no fixed-building set across unit types; no addition-notes workflow |
| Validation / conflict resolution before finalize | Missing | No gate; PDF generates without checks |
| $25 Rentometer vs HelloData rent flags | Missing | No threshold logic in `src/` |
| Same-address unit averaging | Missing | Not implemented |
| Invalid measurement exclusion | Missing | Not implemented |
| Deterministic calculations (never LLM math) | Partial | Display averages only; recommendation KPIs stay static seed |
| MLS geocoded straight-line distances | Missing | `distanceMiles` hardcoded on comps |
| Match tiers Strongest / Moderate / Context | Partial | `MatchStrength` type + UI badges; user can select comps but not reclassify tiers in UI |
| User-set recommended rental ranges | Working (demo) | Pricing page updates store `low`/`high` |
| Claude narrative drafts + edit/approve | Missing | Static `narrative` string; truncated display; no Claude; narrative not editable in UI |
| Branded PDF generation | Partial | Real jsPDF, ~2 pages, not 13-page acceptance layout |
| Weekly updates preserving snapshots + trends | Mocked / Missing | Seeded history rows + schedule UI; no snapshot engine / trend series |
| Google Drive property folders + confirmation | Missing | `doc.save` browser download only (`pdf-report.ts` 281–282) |
| Privacy: strip prospect name/phone/email from client PDFs | Missing | No scrubber; leads seed contains prospect notes; actions/narrative pass through to PDF |
| Auth, ownership, handover, data isolation | Missing | Public client demo |
| Public owner links / DOCX / comp maps / scraping / Rentometer API | Out of scope | Correctly absent (do not build) |

---

## 5. Extraction and calculation audit

### 5.1 Upload → extract flow (actual)

```
User selects file on /upload
  → addUpload(status: processing) to Zustand
  → fake progress interval + sleep(700)
  → csv → parseCsvFile | xlsx/xls → parseExcelFile | pdf → simulatePdfExtraction
  → updateUpload(complete) + preview first 8 rows
  → DOES NOT update comps, units, recommendation, or reports
```

Evidence: `src/app/upload/page.tsx` 61–125; parsers in `src/lib/parse-upload.ts`.

### 5.2 Format handling

| Format | Implementation | Gaps vs Phase 1 |
|--------|----------------|-----------------|
| CSV | Papa Parse `header:true`; numeric coercion; `inferFields` from **first row only** (lines 16–51, 53–76) | No Rentometer column map; no same-address grouping; no curated-comp import into store |
| XLSX/XLS | SheetJS reads workbook; **first sheet only** (lines 78–104) | Multi-sheet Zillow/Apartments workbooks unsupported — **Pending sample-file validation** |
| PDF | Stub returns hardcoded Veterans units + recommendation (lines 106–149); uses only `file.size` | No OCR/LLM; no RI/CT MLS / HelloData / Rentometer summary layouts — **Pending sample-file validation** |

Confidence scores are formulaic (e.g. CSV `0.86 + …`), not model-based.

Sample CSV at `public/samples/comps-sample.csv` demonstrates expected column heuristics (`asking_rent`, `sqft`, etc.) but is not auto-wired into the upload UI.

### 5.3 Deterministic calculations present

| Calc | Location | Notes |
|------|----------|-------|
| Currency / PSF formatters | `src/lib/utils.ts` 8–29 | Display only |
| Unit PSF on override | pricing/reports pages | `askingRent / sqft` |
| Comp midpoint rent/sqft for charts | comparables/pricing | Midpoint of min/max |
| Selected-comp avg rent/psf/distance (UI) | `comparables/page.tsx` 144–170 | **Does not write back** to `recommendation` |
| PDF unit rent/sqft ranges | `pdf-report.ts` 78–86 | From selected units |
| Portfolio seed averages | `portfolio-seed.ts` 269–280, 324–342 | Synthetic |

### 5.4 Deterministic calculations missing (Phase 1 business rules)

1. Same-address multi-unit averaging as one comparable  
2. Exclude invalid measurements from relevant stats  
3. Recompute blended average, PSF, DOM, rent range from **approved** comps  
4. Rentometer vs HelloData rent delta **> $25** → flag + require verified published value  
5. Geocode + haversine (or equivalent) MLS distances  
6. Fixed comp-building set across unit types with missing unit-type visibility  
7. Finalize validation gate for unresolved conflicts  

Recommendation KPIs (`blendedAverage: 2082`, `averagePsf: 2.79`, ranges, DOM) remain seed constants in `veteransRecommendation` (`veterans.ts` 427–434) unless manually patched via `updateRecommendation`.

---

## 6. PDF / report generation audit

### 6.1 Current generator

`src/lib/pdf-report.ts` → `generatePricingReportPdf`:

- Client jsPDF letter format, navy/gold PKL header branding (lines 24–37)
- Sections: subject summary, available units table, recommendation band, KPI strip, narrative, comps table, weekly actions, sources footer
- Downloads via `doc.save(filename)` (lines 281–282)
- Footer: `CONFIDENTIAL — SAMPLE DEMO` (line 278)

Caller: `src/app/buildings/[id]/reports/page.tsx` `handleGenerate` (69–120) — Veterans only.

### 6.2 Hardcoded / fragile PDF behaviors

| Issue | Lines | Risk |
|-------|-------|------|
| Bed/bath always `"1 / 1"` in subject strip | 75 | Breaks 2BR acceptance (855 Providence) |
| KPI label always `"Blended avg (9 comps)"` | 152 | Wrong if fewer comps selected |
| Title/date from `reportMeta` seed | 37, 43–45 | Not report-run aware |
| Narrative/actions pass-through | 176–255 | No PII scrub |
| ~2 pages, table-centric | whole file | Far from 13-page reference layout |
| No photos / floor plans / sectioned market analysis | — | Acceptance gap |
| No Google Drive upload or confirmation UI | — | Scope miss |

### 6.3 Report history

- Seeded + newly generated metadata in Zustand (`demo-store.ts` 43–71, 137)
- Does **not** store PDF bytes, approved comp snapshots, or week-over-week deltas
- Scheduling UI (`reports/schedule/page.tsx`) persists cadence locally; no jobs/email/Drive

### 6.4 End-to-end flow today vs Phase 1 target

**Today:**

```
Seed Veterans data → optional local edits → Generate PDF → browser download
                 ↘ localStorage report metadata
Uploads are a dead-end preview (do not feed the PDF).
```

**Phase 1 target (not implemented):**

```
Sources upload → extract → human verify/resolve → approve comps
  → deterministic stats → Claude draft narrative → edit/approve
  → photo set → branded multi-page PDF → Drive folder confirm
  → weekly snapshot retained for trends
```

---

## 7. Database and API audit

| Concern | Finding |
|---------|---------|
| ORM / migrations | **Missing** |
| Postgres / Neon / etc. | **Missing** |
| REST/Route Handlers | **Missing** — no `src/app/api` |
| Server Actions | **Missing** |
| Domain types | Present in `src/data/types.ts` — client-only shapes |
| File storage | Browser memory + localStorage metadata; uploaded files not retained as blobs |
| Secrets / env | No `process.env` usage in `src/`; README says none required |

### Types that hint at future product (but are demo-thin)

- `Comparable`, `ExcludedComp`, `PricingRecommendation`, `LeadMetrics`, `UploadedExtraction`, `GeneratedReport`, `ScheduledReport` — useful starting vocabulary
- Gaps vs Phase 1: no `UnitType`, `ReportWeek`, `SourceDocument`, `CompBuilding`, `VerifiedRent`, `ConflictFlag`, `PhotoAsset`, `DriveSaveReceipt`, narrative draft/approval states, extraction field provenance

---

## 8. Security and privacy findings

| Finding | Severity | Evidence |
|---------|----------|----------|
| No authentication — entire app public | High (for production) | README L5; Settings badges `settings/page.tsx` 28–31 |
| No middleware, CSP, security headers | Medium | `next.config.ts`, no `middleware.ts` |
| All state in `localStorage` — no server isolation | High | `demo-store.ts` 165–170 |
| No file-type/size server validation (client-only checks) | Medium | `upload/page.tsx` 62–65 |
| No PII scrubbing before PDF | High (Phase 1 rule 12) | `pdf-report.ts` embeds narrative/actions verbatim |
| Leads seed includes prospect tour notes | Medium | `veterans.ts` 468–476 — would be unsafe if copied into client PDF |
| Schedule recipients include example emails in seed | Low (demo) | `demo-store.ts` 80 |
| Fake user “RD” in topbar | Informational | UI only |
| No secrets committed | OK | `.env*` gitignored; no API keys in source |
| `zod` unused — no runtime schema validation on uploads | Medium | package present, no imports in `src/` |

**Privacy rule gap:** Phase 1 requires preventing prospect names, phones, and emails in client PDFs. Current code has **zero** redaction pipeline. Actions text already references “Apartments.com prospect” (`veterans.ts` 438) and would ship into PDF as-is.

---

## 9. Signed scope mismatches (provisional)

Using the prompt’s Phase 1 list as provisional signed scope (signed PDF not in repo):

| Scope item | Mismatch |
|------------|----------|
| Property **and unit-type** reports | App models buildings/units; no unit-type report entity or 2BR workflow |
| Multi-source extraction with human verification | Upload is demo-only and disconnected from comps |
| Both RI MLS and CT connectMLS | Mentions only; no parsers — **Pending sample-file validation** |
| Deterministic comps engine + conflict rules | UI averages ≠ engine; $25 / same-address / invalid measure rules absent |
| Claude-assisted editable narratives | Static copy; no LLM; narrative not editable |
| Photo management | Unsplash placeholders only |
| Branded PDF matching acceptance references | Short demo PDF; **855 Providence 13-page** not represented |
| Weekly history with trends | Simulated schedules + thin history rows |
| Google Drive save with confirmation | Completely absent |
| Privacy + ownership/handover | No auth, no org tenancy, no handover artifacts |
| Out-of-scope items (owner web links, DOCX, maps, scraping, Rentometer API) | Correctly not built — preserve this boundary |

**UI vs scope:** Screens imply “AI Upload,” “Scheduling,” “Rentometer & HelloData pulls,” and live methodology language while code/comments admit sample/demo behavior (`comparables/page.tsx` 174–176). Risk: stakeholders may overestimate readiness from the deployed Vercel demo.

---

## 10. Risks to 855 Providence Street 2BR 13-page acceptance

| Risk | Why |
|------|-----|
| Property absent | No 855 Providence seed, routes, or fixtures |
| Unit type hardcoded to 1BR | PDF subject strip forces `"1 / 1"`; Veterans comps are 1BR/1BA |
| Page count / layout | Generator produces ~2 pages of tables, not a 13-page branded narrative report |
| Source pipeline missing | Cannot ingest the multi-file source pack for that property |
| Comp/photo sections missing | No photo pipeline; comps are Veterans-specific seed |
| Stats engine missing | Cannot regenerate acceptance numbers from approved comps |
| Narrative pipeline missing | Cannot draft/edit 855-specific sections via Claude + approval |
| Drive delivery missing | Cannot satisfy “final PDF in property Drive folder” |
| Sample files unavailable in repo | Full layout parity **Pending sample-file validation** against the 13-page PDF |

Secondary reference **30 Veterans 1BR** is partially represented as the demo fixture; PDF still does not claim parity with the source DOCX layout beyond rough section names — **Pending sample-file validation** against the actual Veterans PDF/DOCX visuals.

---

## 11. Working code worth preserving

Prioritize keeping and evolving (not discarding):

1. **App shell & PKL branding** — `sidebar.tsx`, `app-shell.tsx`, `globals.css`, navy/gold system  
2. **Domain vocabulary** — `src/data/types.ts` (`Comparable`, `MatchStrength`, report/upload shapes)  
3. **Veterans fixture** — `src/data/veterans.ts` as golden regression dataset for 1BR path  
4. **Interaction patterns** — Zustand store for overrides, selected comps, recommendation patches  
5. **CSV/XLSX parse scaffolding** — `parse-upload.ts` + Papa/SheetJS deps (extend with schemas)  
6. **jsPDF branding primitives** — header/footer/colors/tables in `pdf-report.ts` (expand layout; keep brand tokens)  
7. **Charts** — Recharts wrappers for rent comparison / PSF scatter (wire to real approved-comp stats)  
8. **Property sub-nav pattern** — `property-nav.tsx` (generalize beyond Veterans gate)

Do **not** preserve as product truth: portfolio RNG as production inventory, PDF simulation as AI, schedule fake emails, Unsplash as photo management, localStorage as system of record.

---

## 12. P0 / P1 / P2 priorities

Priority labels are engineering urgency, **not** contract phases.

### P0 — Blockers for any real Phase 1 delivery

1. Introduce durable backend (DB + authenticated API) and replace localStorage as system of record  
2. Property + **unit-type** report workspace model (statuses, weeks, ownership)  
3. Source document upload + storage with schema-aware extractors (Rentometer CSV/XLSX first)  
4. Human verification UI + finalize gates (conflicts, $25 flags)  
5. Deterministic calculation module (same-address avg, exclusions, approved-comp stats)  
6. Privacy scrubber before any client-facing PDF  
7. Expand PDF generator toward acceptance structure; remove 1BR hardcoding  
8. Obtain sample files for 855 Providence + source packs — **Pending sample-file validation**

### P1 — Required to close core Phase 1 scope

9. HelloData PDF enrichment (ignore subject rows)  
10. RI MLS + CT MLS PDF parsers + geocoded distances  
11. Zillow / Apartments multi-sheet XLSX mapping  
12. Claude narrative draft + edit/approve workflow (LLM never does money math)  
13. Photo upload / paste / 3:2 crop / MLS extract / prior-week reuse / placeholders  
14. Google Drive property-folder save + user confirmation  
15. Weekly snapshot retention + trend views  
16. Fixed comp-building sets across unit types + addition notes  

### P2 — Hardening / handover

17. Auth (staff roles), audit log, org tenancy  
18. Automated tests (calc golden tests, parser fixtures, PDF smoke)  
19. Observability, rate limits, malware/file scanning  
20. Ops runbooks, env templates, ownership/handover package  
21. Performance for large XLSX/PDF batches  
22. Remove or clearly quarantine demo portfolio RNG from production builds  

---

## 13. Milestone-based task plan

> Exact signed milestone titles/dates: **Pending sample-file validation** (`PKL_Phase1_Scope_SignOff.pdf` not in repo). Provisional slices below map to typical Phase 1 delivery order.

### Milestone A — Data foundation & verification workspace

- Persist properties, unit types, report weeks, source files, extractions candidates  
- Rentometer CSV/XLSX curated-comp import + review UI  
- Stub-resistant upload API (auth, validation, storage)  
- Wire Veterans fixture as first end-to-end property; scaffold 855 Providence shell  
- **Exit:** Staff can upload Rentometer tabular file, edit/approve comps for one unit type, save draft report state server-side  

### Milestone B — Calculations, conflicts, narratives, photos

- Deterministic stats engine + $25 / conflict gates  
- HelloData + MLS + listing XLSX parsers (as samples arrive)  
- Claude narrative drafts with edit/approve; money math stays in app code  
- Photo pipeline (3:2 crop, placeholders, reuse)  
- **Exit:** Approved dataset produces stable numeric KPIs and an editable narrative without unresolved conflicts  

### Milestone C — Acceptance PDF, Drive, weekly ops

- Multi-page branded PDF aligned to 855 Providence 2BR 13-page reference  
- Google Drive folder write + confirmation UX  
- Weekly snapshot/history/trends; schedule that actually runs (or explicit manual weekly flow if automation deferred)  
- Privacy scrub + QA against both acceptance references  
- Auth/handover hardening  
- **Exit:** Staff finalizes 855 Providence 2BR report, PDF matches acceptance structure, Drive confirm succeeds, prior week retained  

---

## 14. Proposed first implementation task

### Task: Add Phase 1 domain foundation (DB models + API skeleton) without changing demo UI behavior yet

**Goal:** Establish the durable entities Phase 1 needs (Property, UnitType, Report, SourceDocument, ComparableCandidate) behind feature-flagged API routes, while leaving existing pages on the demo store so the Vercel UI keeps working.

**Exact files expected to be touched (first coding slice):**

| Action | Path |
|--------|------|
| Add | `docs/phase1/` (this audit already); env example e.g. `.env.example` |
| Add | DB schema / migration (tooling TBD with stack choice: Prisma/Drizzle) under e.g. `prisma/schema.prisma` or `src/db/` |
| Add | `src/server/` or `src/lib/domain/` — pure TypeScript types extending `src/data/types.ts` |
| Add | `src/lib/calculations/` — empty module + first pure functions scaffold (same-address average, $25 flag) with unit tests |
| Add | `src/app/api/health/route.ts` — authenticated-ready health check |
| Extend | `src/data/types.ts` — `UnitType`, conflict/photo/source enums (non-breaking) |
| Do **not** yet rewrite | `src/app/**` pages, `demo-store.ts`, `pdf-report.ts` branding |

**Why first:** Every extraction, calc, PDF, and Drive feature depends on durable report state. Starting with UI-only work would deepen the localStorage demo debt. Calculations scaffolded as pure functions can be golden-tested as soon as sample files arrive.

**Immediate dependency / blocker:** Choose persistence (e.g. Postgres/Neon) and auth approach with the client; obtain Rentometer sample CSV and 855 Providence pack for parser/PDF acceptance — **Pending sample-file validation**.

---

## 15. Blockers, assumptions, and client decisions

### Blockers

1. Signed scope PDF, source ZIPs, 855 Providence 13-page PDF, Claude build logs **not in repo**  
2. No sample RI MLS / CT connectMLS / HelloData / Rentometer PDF binaries to validate parsers  
3. No Google Drive folder IDs, service account, or OAuth decision  
4. No Anthropic API access / prompt pack for narrative tone  
5. Acceptance visual spec for PDF sections beyond “match the 13-page report”  

### Assumptions (audit)

1. Deployed Vercel app matches this repository’s demo behavior (not re-verified live against production HTML in this audit pass)  
2. `references/30-veterans-pricing-report.docx` is the origin of `veterans.ts` figures (coded values not re-extracted from the DOCX here) — **Pending sample-file validation**  
3. “SmartMLS (CT)” in seed copy corresponds to the prompt’s “Connecticut connectMLS” — **client confirmation needed**  
4. Three contract milestones exist and can be mapped to provisional A/B/C above  

### Questions requiring client decisions

1. Preferred auth (Google Workspace SSO, email magic link, shared staff login)?  
2. Database hosting and who owns the production project?  
3. Google Drive: shared drive vs per-property folders; naming convention; service account vs user OAuth?  
4. Is weekly generation fully automated or staff-triggered with reminders?  
5. Confirm CT MLS product name and expected PDF layouts for RI vs CT  
6. Claude model tier / retention policy for uploaded listing PDFs  
7. Should the synthetic 100+ building portfolio remain in production UI or staff-only demo mode?  
8. Who is the system of record for property master data (PKL spreadsheet, PMS, manual entry)?  
9. Exact milestone acceptance criteria wording from `PKL_Phase1_Scope_SignOff.pdf`  
10. Privacy: are lead phone/email allowed in **internal** drafts but stripped only on **client** PDFs, or banned earlier in the pipeline?

---

## 16. Evidence index (key paths)

| Path | Role |
|------|------|
| `README.md` | States demo: no auth/DB/paid APIs; sample vs live table |
| `package.json` | Deps/scripts; no AI/Drive/test tooling |
| `src/data/types.ts` | Client domain types |
| `src/data/veterans.ts` | Featured 1BR fixture + static narrative |
| `src/data/portfolio-seed.ts` | Synthetic portfolio generator |
| `src/store/demo-store.ts` | Zustand + localStorage |
| `src/lib/parse-upload.ts` | CSV/XLSX real; PDF simulated |
| `src/lib/pdf-report.ts` | Client branded PDF download |
| `src/app/upload/page.tsx` | Upload UX; extraction dead-end |
| `src/app/buildings/[id]/reports/page.tsx` | PDF generate path |
| `src/app/buildings/[id]/comparables/page.tsx` | Comp selection; methodology disclaimer |
| `src/app/settings/page.tsx` | Explicit “No authentication / No database / No paid APIs” |
| `references/30-veterans-pricing-report.docx` | Offline Veterans source |
| `public/samples/comps-sample.csv` | Sample tabular comps |

---

## 17. Bottom line

This codebase is a **credible UX prototype** centered on one hardcoded Veterans 1BR report. It is **not** an implementation of Phase 1 automation. Treat it as a UI and branding asset plus a Veterans regression fixture; the production path requires new persistence, extraction, calculation, narrative, PDF, privacy, and Drive layers — validated against sample files that are not yet available in this repository.
