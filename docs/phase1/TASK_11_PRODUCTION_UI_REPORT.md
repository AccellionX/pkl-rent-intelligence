# Task #11 — Production UI Cleanup & Live Data Integration

**Overall status:** **PARTIAL**  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk`  

Live mode now uses authenticated Supabase APIs for dashboard, properties, uploads, comps review, pricing/PDF, weekly updates, and report history. Demo seed/Zustand paths remain isolated for developer mode only. No auto-approval of comps. No commit / push / deploy.

---

## Axis / verdict

| Area | Result |
|------|--------|
| Live navigation & demo removal | **PASS** |
| Dashboard / properties / history APIs | **PASS** |
| Comp review UI (855 reconciliation) | **PASS** (human actions still required) |
| Pricing / weekly / PDF live screens | **PASS** (existing live components retained) |
| Browser walkthrough (full login→PDF) | **PARTIAL** (auth redirect verified; controlled-input login automation flaky) |
| Acceptance of 855 comps | **BLOCKED** (staff must still approve — Task #10A) |

---

## 1. Before / after route inventory

| Route | Before (live env) | After |
|-------|-------------------|--------|
| `/` | Seed portfolio dashboard + Veterans hero | **Live dashboard** KPIs from `/api/dashboard` |
| `/buildings` | Seed building grid | **Live property list** + create |
| `/buildings/[id]` | Demo seed / Veterans-only deep dive | **Live property edit** + unit types + report list |
| `/buildings/[id]/comparables` | Live UUID → reconciliation UI; else Veterans demo | Unchanged (live reconciliation actionable) |
| `/buildings/[id]/pricing` | Live narrative UI for UUID | Unchanged |
| `/buildings/[id]/leads` | Live weekly UI for UUID | Labelled **Weekly Updates** |
| `/buildings/[id]/reports` | Live PDF UI for UUID | Unchanged |
| `/upload` | Live + manual UUID fields | Live org/property/unit-type selectors |
| `/reports` | localStorage history | **Live org report history** |
| `/reports/schedule` | Demo schedules | Live: **out-of-scope empty state** |
| `/units` | Seed units grid | Live: redirect guidance to properties |
| `/settings` | Demo reset | Live: account/org picker + Phase 1 boundaries |
| `/login` | Session | Soft-protect redirect target; post-login → `/` |

**Sidebar (live):** Dashboard · Properties · Data Uploads · Report History · Account · Settings  
**Removed from live nav:** 30 Veterans shortcut, Units, Scheduling, “Demo Settings” label, demo footer copy.

---

## 2. Demo features removed from live mode

- Seed portfolio stats, occupancy charts, fabricated vacancy rankings  
- Veterans featured CTA on dashboard  
- Zustand/localStorage as fallback after API errors (explicit error / empty states)  
- Demo success toasts for nonfunctional scheduling in live  
- Global Units grid presenting seed data  
- Misleading “Saved to Drive” unless status is actually `saved_to_drive`

Demo fixtures remain under `src/data/*`, `src/store/demo-store.ts`, and `Demo*` components when `getAppMode() === "demo"`.

---

## 3. Phase 2 / unsupported options hidden

Documented in live Settings:

- Comp maps in PDFs  
- Public owner report links  
- DOCX export  
- Automatic Zillow/Apartments scraping  
- Automatic listing-photo fetch  
- Rentometer API (upload-only remains)  
- Email scheduling  

Shared demo code not deleted.

---

## 4. Live API connections

| UI | API |
|----|-----|
| Session / org | `GET /api/me` |
| Dashboard | `GET /api/dashboard?organizationId=` |
| Properties list/create | `GET/POST /api/properties` |
| Property detail/edit | `GET/PATCH /api/properties/[id]` |
| Unit types | `GET/POST /api/properties/[id]/unit-types` |
| Report history | `GET /api/reports?organizationId=` |
| Uploads / review | existing `/api/uploads`, `/api/extractions/[id]/review` |
| Comps reconciliation | `/api/properties/[id]/comparables/reconciliation` + unit-data PATCH |
| Pricing / narrative / PDF / weekly | existing Task #8–#10 routes |

New routes: `/api/me`, `/api/dashboard`, `/api/reports` (org-wide).

---

## 5. Screens completed (live)

1. Login (+ proxy soft-auth redirect with `?next=`)  
2. Dashboard (real counts / recent reports / empty states)  
3. Properties list + create  
4. Property overview (edit amenities/links, unit types, report list)  
5. Data Uploads (source types + org/property selectors)  
6. Comparables review (855 reference matrix; Accept/Exclude/tier — human only)  
7. Pricing & Reports (narrative + recommendation)  
8. Weekly Updates  
9. PDF workspace  
10. Report History  
11. Settings (org switch / sign out / Phase 1 boundaries)

---

## 6. Screens still blocked / incomplete

| Item | Status |
|------|--------|
| Subject-unit row CRUD API/UI | Partial — unit types yes; dedicated subject_units manager not built |
| Photo upload/crop UI on property | API exists; property page does not yet host full photo manager |
| 855 full approved set → 13-page PDF | Blocked on human approvals (Task #10A) |
| Multi-org picker UX on every page | Org stored in localStorage; Settings switch works |
| Drive upload confirmation | Correctly not faked |

---

## 7. Real browser verification

| Check | Result |
|-------|--------|
| Live sidebar labels | **Pass** (Dashboard / Properties / Data Uploads / …) |
| Unauthenticated `/buildings` → `/login?next=/buildings` | **Pass** |
| `/api/health` live | **Pass** |
| Authenticated `/api/me`, `/api/dashboard`, `/api/properties`, `/api/reports` | **Pass** (CLI session) |
| Browser password fill → React controlled login | **Partial / flaky** — native setter needed; full UI login not reliably automated this run |
| Empty dashboard for org with 0 properties | Expected honest empty counts |

No automatic approval of 855 comps performed in browser.

---

## 8. Comp review workflow status

Unchanged rules from Task #10A:

- Reference suggestions are **recommendations only**  
- Accept / Exclude / Set tier require explicit staff clicks  
- Chateau Regale / Lake still need human reject if approved incorrectly  
- MLS comps still require CMA upload  

UI entry: `/buildings/{uuid}/comparables`

---

## 9. Security checks

- Live UI gates via proxy redirect + `LiveAuthGate`  
- APIs use `requireAuth` + org membership  
- No demo fallback on API failure  
- Service role not exposed to client  
- Cross-tenant still 404/403 at API layer  
- Client PDFs continue to exclude prospect PII (prior tasks)

---

## 10. Tests and build

| Command | Result |
|---------|--------|
| `npm test` | **108 passed** / 23 files |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** (0 errors) |
| `npm run build` | **PASS** |

---

## 11. Remaining issues

1. Browser automation of React controlled login fields is unreliable; prefer CLI auth for E2E.  
2. Default org selection may point at an empty org — use Settings to pick the 855 comps org.  
3. Subject units & photo management UI still thin.  
4. 855 acceptance still blocked on staff approvals.  
5. Proxy blocks all unauthenticated pages when live env is configured (demo UI unreachable without signing in).

---

## 12. Next recommended task

**Task #12 — Staff-led 855 acceptance pass + subject unit/photo polish**

1. In Settings, select the org that owns `95e5b201-…`  
2. Complete Task #10A human approval checklist  
3. Add subject-unit CRUD + photo crop UI on property overview  
4. Harden browser E2E login (or cookie injection harness)  
5. Visual PDF diff vs 13-page reference after approvals  
