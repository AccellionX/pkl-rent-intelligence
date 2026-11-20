# Task #18A — Final Local Release Gate

**Date:** 2026-11-18  
**Overall verdict:** **GO for local Phase 1 completion** · **NO-GO for production deployment (Task #19)**  
**Scope:** Close remaining independently achievable QA gaps from Task #18. Phase 1 only. No Vercel changes, no commit/push, no client comparable approvals.

---

## 1. Verdict

Independently fixable Critical/High gaps from Task #18 are closed:

| Gap (Task #18) | #18A result |
|----------------|-------------|
| Browser file-picker uploads **NOT TESTED** | **PASS** — Playwright `setInputFiles` on live Upload UI |
| Invalid upload / retry | **PASS** |
| Photo crop / reorder / reuse deep dive | **PASS** after subject-gallery hang fix |
| Tablet 768 / laptop 1280 | **PASS** — 40 responsive screenshots |
| Second-tenant isolation | **PASS** — controlled QA Org B + no-org user |
| Customer-facing 855 chrome | **PASS** — none on gate, misnamed 855, or upload |

Production deployment remains **NO-GO** solely due to documented **external blockers** and production ownership items — not due to open independently fixable product defects.

---

## 2. Six previously blocked / untested scenarios

| # | Scenario (from Task #18) | #18A result | Evidence |
|---|--------------------------|-------------|----------|
| 11 | Browser file-picker attach of source documents | **PASS** | `tmp/task18a/screenshots/upload-*.png` · `evidence.json` uploads |
| 19 | Tablet 768 | **PASS** | `tmp/task18a/responsive/tablet-768-*.png` |
| 20 | Laptop 1280 | **PASS** | `tmp/task18a/responsive/laptop-1280-*.png` |
| 22 | Clipboard paste photo | **PARTIAL** | Paste handler present in UI; upload path fully exercised via file input |
| 23 | Invalid upload via UI | **PASS** | `upload-invalid.png` · friendly failure |
| 27 | Cross-org second-tenant negatives | **PASS** | `tenant-b-portfolio.png`, `tenant-noorg.png`, API 403/404 matrix |

Open Drive in external Google account (#13) remains **BLOCKED** (external login) — unchanged.

---

## 3. Browser upload evidence (UI only — no API bypass)

Isolated property: **Eighteen A Upload Gate e1ups** (`0d310163-…`) under PKL Management LLC.  
Method: Playwright Chromium → `/upload` → Select source/property → `input[type=file].setInputFiles(...)`.

| Source | File | Pending | Extraction / review UI | Result |
|--------|------|---------|------------------------|--------|
| Rentometer CSV | `synthetic-2bed.csv` | Yes | Yes | **PASS** (+ re-upload without crash) |
| Rentometer Excel | `synthetic-2bed.xlsx` | Yes | Yes | **PASS** |
| Rentometer PDF | authorized 855 package PDF | Yes | Yes | **PASS** |
| HelloData PDF | Veterans package | Yes | Yes | **PASS** |
| RI MLS CMA | Veterans package | Yes | Yes | **PASS** |
| CT MLS CMA | `Report (1).pdf` | Yes | Yes | **PASS** |
| Zillow XLSX | Veterans package | Yes | Yes | **PASS** |
| Apartments.com XLSX | Veterans package | Yes | Yes | **PASS** |
| Invalid `.txt` | `bad-upload.txt` | — | Friendly failure / retry copy | **PASS** |

Subject photographs exercised on property Overview (see §4). Comparable photographs: no separate customer photo-manager mount on Comparables review; MLS ingest path verified not to attach unmatched MLS images as subject (`mlsOrphansAsSubject: 0`). Matched comparable photo rows appear only after human accept (not auto-approved in this gate).

---

## 4. Photo workflow evidence

Property Overview → Subject photos (browser):

| Step | Result |
|------|--------|
| Upload | **PASS** (`#1 · upload`) |
| Crop to 3:2 + Save crop | **PASS** (UI “cropped 3:2” + DB `aspect: "3:2"`) |
| Reorder (Down) | **PASS** |
| Replace | **PASS** |
| Remove (confirm dialog) | **PASS** |
| Reuse | **PASS** (`prior_week` / additional row) |
| Save + refresh persist | **PASS** |
| Unmatched MLS never on subject | **PASS** (`mlsOrphansAsSubject: 0`) |

Screenshot: `tmp/task18a/screenshots/photo-workflow-final.png`

**Defect found & fixed:** After large MLS ingest, subject photo GET signed **every comparable photo URL**, hanging the Overview gallery. Fixed with `filterPhotosForGallery` (`src/lib/photos/list-filter.ts`) + regression `tests/unit/photo-list-filter.test.ts`.

---

## 5. Tenant isolation evidence

Controlled accounts (not real client permissions):

- **Org A:** PKL Management LLC — `admin@pkl.com`
- **Org B:** QA Isolation Org B — `qa.tenant.b@example.com` (+ Org C membership for switcher)
- **No org:** `qa.noorg@example.com`

| Check | Result |
|-------|--------|
| Separate organization portfolios | **PASS** — B sees only Tenant B Private Property |
| Unauthorized property / comps / photos / unit-types | **PASS** — browser blocked · API **404** |
| Unauthorized org property list (`organizationId=A`) | **PASS** — API **403** |
| Unauthorized PDF download | **PASS** — **404** |
| Unauthorized Drive backup | **PASS** — **404** |
| Organization switching | **PASS** — Active organization switcher (Org B / Org C) |
| Users without organization membership | **PASS** — “No organization access…” · no foreign properties |

Screenshots: `tenant-b-portfolio.png`, `tenant-b-foreign-property.png`, `tenant-noorg.png`.  
**No Critical cross-tenant data exposure observed.**

---

## 6. Responsive screenshots

40 captures under `tmp/task18a/responsive/`:

| Viewport | Width | Pages |
|----------|-------|-------|
| Desktop | 1440 | Dashboard, Properties, Uploads, Settings, Report history, property Overview / Comparables / Pricing / Weekly / PDF |
| Laptop | 1280 | same |
| Tablet | 768 | same |
| Mobile | 390 | same (+ Menu drawer); re-shot after auth settle |

Usable navigation, forms, and controls verified. No redesign performed. Mobile Menu control remains the supported navigation pattern under `md`.

---

## 7. Reference content isolation

| Surface | Result |
|---------|--------|
| Upload review | No “855 ref” / Suggested exclude badges |
| Gate property Comparables | Property-scoped review only |
| Misnamed / address-matched 855 property Comparables | No customer acceptance tooling chrome |
| Reconciliation API | Still gated by `isProvidence855Subject` (internal) |

Upload Accept control cleaned of leftover `refExcluded` / `suggested` references (TypeScript breakage from prior 855 strip).

---

## 8. Complete representative PDF

Controlled finalized report (Task #18 pipeline), private storage download:

| Item | Result |
|------|--------|
| Path | `tmp/task18a/complete-controlled.pdf` (~358 KB) |
| Pages | **3** (renderer acceptance — not forced to client page counts) |
| Drive | Linked (`driveFileName` present · prior `saved_to_drive`) |
| Page renders | `tmp/task18a/pdf-pages/gate-p01.png` … `gate-p03.png` |

Page inspection:

1. Subject unit table, subject photo, recommendation band, market KPIs, Claude narrative  
2. Comparable table/cards + weekly marketing metrics  
3. Tours / applications / agent feedback empties + footnotes (honest sparse where data absent)

**Separate from** 855 historical client parity (still externally blocked).

---

## 9. Defects found and fixed in #18A

| Sev | Defect | Fix |
|-----|--------|-----|
| **High** | Subject photo gallery hung after MLS ingest (signed all comparable URLs) | `filterPhotosForGallery` — subject list excludes comparable + MLS orphan rows |
| **High** | Upload page TS errors (`refExcluded` / `suggested` undefined) after 855 chrome strip | Accept/Exclude buttons use plain review actions |
| **Medium** | `AppShell` lint: `setState` in `useEffect` on pathname | Reset mobile nav during render when path changes |
| **Info** | First tenant checks raced “Checking your account…” | Longer settle waits in gate script (not a product defect) |

---

## 10. Automated verification

| Command | Result |
|---------|--------|
| `npm test` | **38 files / 202 tests PASS** (+2 photo-list-filter) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

Migrations (linked `mqsvrastpdratvzuouxk`): local ↔ remote **synchronized** (10 migrations). No push performed.

Machine evidence: `tmp/task18a/evidence.json`, `scripts/task18a-release-gate.mjs`.

---

## 11. Production environment checklist

Secret **values are not printed**. Status = present in local `.env` only.

| Variable | Required | Scope | Local configured | Dev vs prod ownership |
|----------|----------|-------|------------------|------------------------|
| `NEXT_PUBLIC_APP_URL` | Required | Browser-safe | Yes | Both — prod URL on Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Browser-safe | Yes | Both |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required | Browser-safe | Yes | Both |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Server-only | Yes | Both — never `NEXT_PUBLIC_` |
| `ANTHROPIC_API_KEY` | Optional* | Server-only | Yes | Both (*needed for live narrative) |
| `ANTHROPIC_MODEL` | Optional | Server-only | Yes | Both |
| `GOOGLE_GEOCODING_API_KEY` | Optional* | Server-only | Yes | Both (*blocked by GCP billing) |
| `GOOGLE_DRIVE_CLIENT_ID` | Optional* | Server-only | Yes | Prod plan — dedicated PKL OAuth |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Optional* | Server-only | Yes | Prod plan |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Optional* | Server-only | Yes (dev Testing) | **Prod plan** — publish app / stable token |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Optional | Server-only | No | Prod plan |
| `GOOGLE_DRIVE_SCOPES` | Optional | Server-only | Yes | Prod plan |
| `PDF_RENDERER` | Optional | Server-only | Yes (`jspdf`) | Prefer `jspdf` on serverless |
| `PKL_ALLOW_DEMO_MODE` | Optional | Server-only | **Unset** | Must stay unset in production |
| `DATABASE_URL` / `SUPABASE_DB_URL` | Optional | Server-only | No | Dev CLI only |
| `SUPABASE_ACCESS_TOKEN` | Optional | Server-only | Yes | Dev CLI / Management API |

### Readiness notes

| Topic | Status |
|-------|--------|
| Production build | Local `npm run build` **PASS** |
| Auth configuration | Live mode health OK; prod redirect URLs still a Vercel/#19 item |
| Migration sync | **Synced** — do not blind `db push` |
| Private storage | Source-documents / report-photos remain private (probe tests) |
| Claude | Configured locally; confirm on Vercel at #19 |
| Google Drive OAuth prod plan | Dev token exists; **production-authorized credentials / app publish still required** |
| Geocoding billing | Key present · **billing blocker remains** |
| Secure logging | User-facing errors routed through `toUserFacingError`; no secrets in UI |
| Deployment rollback | Not exercised — plan: retain prior Vercel deployment + DB migration reconcile only under explicit auth |

**Do not modify Vercel in this task.**

---

## 12. External blockers (unchanged — not claimed resolved)

1. Missing **855 RI MLS CMA** source for contractual listings  
2. **Sixteen** pending human comparable reviews (do not auto-approve)  
3. Google Geocoding **billing**  
4. Veterans authoritative branded report decision  
5. PKL-authorized **production** Google Drive credentials / OAuth publish  

---

## 13. Remaining human actions

1. Supply 855 RI MLS CMA and complete human comparable decisions when authorized.  
2. Enable GCP billing for Geocoding distances.  
3. Decide Veterans gold PDF vs waive parity.  
4. Provision production Google Drive OAuth (published app + stable refresh token + root folder).  
5. Set Vercel env from §11 checklist under explicit Task #19 authorization.  
6. Optional: clipboard-paste photo smoke on a staff workstation.  
7. Authorize Task #19 only after accepting external-blocker residual risk.

---

## 14. GO / NO-GO

| Decision | Recommendation |
|----------|----------------|
| **Local Phase 1 release gate (#18A)** | **GO** — outstanding independently achievable QA gaps closed; 202 tests green; build green |
| **Production deployment (#19)** | **NO-GO** until external blockers + production env/Drive/geocode ownership are accepted |

Do not treat this document as production deploy authorization.
