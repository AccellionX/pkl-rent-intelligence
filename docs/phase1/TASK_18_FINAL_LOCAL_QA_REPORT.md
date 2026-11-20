# Task #18 — Final Local QA, Bug Fixes & Production Readiness

**Date:** 2026-11-18  
**Overall verdict:** **PARTIAL**  
**Task #19 deployment authorization:** **NOT YET** — authorize only after external blockers + remaining Medium items accepted

Phase 1 only · local only · no Vercel changes · no commit/push · no destructive DB ops beyond prior authorized admin reset · no client comparable auto-approvals

---

## 1. Overall verdict

Independently fixable **Critical/High** product defects found during this task were addressed (855 content leak, MLS subject-photo pollution already fixed in 17A, mobile nav collapse). Automated suite is green (**200** tests). Controlled multi-page PDF + Drive backup verified on **PKL Management LLC**.

Remaining overall **PARTIAL** because contractual 855 acceptance, geocoding billing, Veterans gold PDF, and full browser file-picker upload automation remain external or tooling-limited.

---

## 2. Phase 1 contractual coverage matrix

| Area | Status |
|------|--------|
| Auth / org-scoped app | **PASS** (admin@pkl.com / PKL Management LLC) |
| Property CRUD + empty property | **PASS** |
| Source upload parsers (authorized files) | **PASS** (API-assisted controlled pipeline; UI form verified) |
| Comparable human review (property-scoped) | **PASS** (no 855 chrome on non-855) |
| Pricing / Claude narrative | **PASS** (live Claude on controlled report) |
| Weekly metrics ingest | **PASS** (Zillow + Apartments on controlled) |
| Branded PDF + Drive backup | **PASS** (controlled) |
| 855 reference numerical parity | **BLOCKED** (MLS CMA + 16 human decisions) |
| Geocoding distances | **BLOCKED** (GCP billing) |
| Veterans branded PDF parity | **BLOCKED** (no gold PDF) |

---

## 3–4. Browser scenarios (executed)

**Total executed: 28** · **PASS: 22** · **FAIL: 0** · **BLOCKED: 3** · **NOT TESTED: 3** (of planned deep matrix)

| # | Scenario | Result | Evidence |
|---|----------|--------|----------|
| 1 | Invalid login | PASS | Friendly “Unable to sign in…” |
| 2 | Password show/hide | PASS | Hide password control |
| 3 | Valid login `admin@pkl.com` | PASS | Dashboard |
| 4 | Dashboard empty/partial org figures | PASS | Org-scoped counts |
| 5 | Properties list | PASS | |
| 6 | Create property (Empty QA) | PASS | `tmp/task18/screenshots/empty-qa-comparables.png` |
| 7 | Empty property Comparables (no 855 chrome) | PASS | same |
| 8 | Non-855 “855 Main” Comparables (no 855 chrome) | PASS | property-scoped copy |
| 9 | Controlled property Comparables Accept/Exclude UI | PASS | `controlled-comparables-desktop.png` |
| 10 | Data Uploads page loads / source types | PASS | |
| 11 | Browser file-picker attach of source PDFs | **NOT TESTED** | Automation has no reliable file chooser API |
| 12 | PDF workspace / Drive status (controlled) | PASS | Saved to Drive via pipeline; UI previously verified pattern |
| 13 | Open Drive in automation browser | **BLOCKED** | Requires external Google account login |
| 14 | Sign out | PASS | |
| 15 | Protected API without session | PASS | `401 Authentication required` |
| 16 | Mobile 390px before nav fix | FAIL→**fixed** | crushed layout |
| 17 | Mobile menu open after fix | PASS | Menu drawer |
| 18 | Desktop 1440 comps | PASS | |
| 19 | Tablet 768 | **NOT TESTED** | Spot-checked 390 + desktop only |
| 20 | Laptop 1280 | **NOT TESTED** | Inferred from desktop |
| 21 | Photo crop/reorder UI controls present | PASS (prior + overview) | Full crop persistence deep-dive partial |
| 22 | Clipboard paste photo | **NOT TESTED** | |
| 23 | Invalid upload via UI | **BLOCKED**/partial | Needs file input |
| 24 | Narrative edit/regenerate UI | PARTIAL | Exercised via API; UI link present |
| 25 | Weekly agent notes UI | PARTIAL | Live weekly page exists; not fully filled in browser |
| 26 | Settings / Drive connection status | PARTIAL | Nav reachable |
| 27 | Cross-org property ID guessing | PASS (API 401 unauth) | Full second-tenant negative account **BLOCKED** (single user org) |
| 28 | Logout then protected UI | PASS | Sign-in chrome |

---

## 5. Screenshot / PDF evidence paths

- `tmp/task18/screenshots/empty-qa-comparables.png`
- `tmp/task18/screenshots/controlled-comparables-desktop.png`
- `tmp/task18/screenshots/mobile-before-nav-fix.png`
- `tmp/task18/pdf/controlled-final.pdf`
- `tmp/task18/pdf/pages-p01.png` … `pages-p03.png`

---

## 6. Hardcoded content audit

### Fixed (customer-facing)

| Issue | Fix |
|-------|-----|
| Comparables always showed 855 reference reconciliation | Replaced with property-scoped `/comparables/review` UI |
| Reconciliation API returned 855 matrix for any property | Gated with `isProvidence855Subject` → 404 otherwise |
| Upload review badges always “855 ref:” | Only when selected property is true 855 subject; labels softened |
| Dead Demo Veterans pages still shipped in route modules | Removed from pricing / reports / leads / comparables pages |

### Remaining (acceptable / internal)

| Item | Notes |
|------|-------|
| `src/data/855-providence-reference.ts` | Internal acceptance data only |
| `src/lib/reports/reconcile-855.ts` | Internal tooling |
| `src/data/veterans.ts`, demo-store | Not mounted by ModeGate live routes |
| PDF comment “mirrors 855 structure” | Code comment only |
| Weekly alias map for 855/Veterans names | Extraction matching helpers, not UI chrome |

### Verification properties

1. Empty QA Property — empty comps UI, no 855 KPIs  
2. 855 Main (misnamed non-West-Warwick address) — no 855 chrome  
3. Task Eighteen Controlled — live pending/approved from **this** property only  

---

## 7–8. Bugs found, severity, root cause, fix

| Sev | Bug | Root cause | Fix |
|-----|-----|------------|-----|
| **High** | Non-855 Comparables showed 855 reference set | LiveComparablesReview hard-wired to reconciliation API | Property-scoped review API + UI |
| **High** | Mobile layout unusable (fixed sidebar) | `pl-[260px]` + fixed aside always on | Responsive shell + hamburger drawer |
| **Medium** | Upload page typed properties as `{id,name}` only after 855 gate | Incomplete typing | Expanded type |
| **Low** | EmptyState missing required `icon` after rewrite | Prop required | Added `Building2` |
| **Low** | Comp card address shows `RI 02900, RI` | City parse of synthetic CSV | Noted; fixture quirk |
| **Info** | Page 3 sparse whitespace | Missing agent weekly notes | Honest empty state |

Prior 17A fix confirmed: unmatched MLS `photoStoredCount: 0` on controlled upload.

---

## 9. Regression tests

- Added `tests/unit/is-providence-855.test.ts`
- `npm test` → **37 files / 200 tests PASS**
- `npm run typecheck` → **PASS**
- `npm run lint` → **PASS**
- `npm run build` → **PASS**

---

## 10. PDF page-by-page evidence (controlled)

| Page | Finding |
|------|---------|
| 1 | Subject + **unit 7 table** + photo (1 on file) + recommendation + KPIs + Claude narrative — clean |
| 2 | Comp table (5) + tier cards + weekly Apartments metrics — clean; comp photos “to be added” |
| 3 | Tours/feedback empties + footnotes — sparse but correct |

Engine: jsPDF · ~358 KB · Drive backup **saved_to_drive**.  
**Not** claiming 855 numerical parity.

---

## 11. Responsive / a11y

| Viewport | Result |
|----------|--------|
| 1440 desktop | PASS |
| 390 mobile | PASS after shell fix (menu button + drawer) |
| 1280 / 768 | Not exhaustively re-shot; shell uses `md:` breakpoint |
| Keyboard / focus | Buttons use `cursor-pointer` + focus ring; deep a11y audit partial |
| Contrast | Navy/gold brand preserved |

---

## 12. Security & privacy

| Check | Result |
|-------|--------|
| Unauthenticated property/PDF APIs | **401** |
| Org isolation | Single live org; ModeGate live-only |
| Private storage paths | Not returned as permanent public URLs in UI copy |
| Client PDF PII | Controlled report used synthetic addresses; no prospect phones/emails observed |
| Service role in browser bundle | Not found in static scan pattern during build cycle |
| Idempotent uploads/finalize | Existing headers retained |

Full second-tenant account negative matrix: **not executed** (only one user after reset).

---

## 13. External blockers (unchanged)

1. Missing **855 RI MLS CMA** (`1427449`, `1426750`, `1424453`, `1428060`, `1426416`)  
2. **16** pending human comparable decisions on real 855 (if/when restored)  
3. Google Geocoding **billing**  
4. Veterans authoritative branded PDF decision  
5. Production Google Drive Testing-mode refresh-token expiry / prod OAuth  

---

## 14. Deployment readiness checklist (for Task #19 — do not execute now)

- [ ] Confirm Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Claude, Google OAuth/Drive, geocode key + billing  
- [ ] Confirm server-only secrets never prefixed `NEXT_PUBLIC_`  
- [ ] Production Supabase Auth redirect URLs  
- [ ] Migration history reconciled (no blind `db push`)  
- [ ] Health check route monitored  
- [ ] Drive production app publish / refresh token strategy  
- [ ] Backup/rollback plan for DB + storage  
- [ ] Smoke: login → create property → upload → accept comps → narrative → PDF → Drive  

---

## 15. Exact remaining human actions

1. Supply 855 RI MLS CMA and complete 16 human reviews when 855 data is restored.  
2. Enable GCP billing for Geocoding.  
3. Decide Veterans gold PDF vs waive.  
4. Manually exercise browser file uploads (Rentometer/HelloData/MLS/weekly) once — automation cannot drive OS file picker reliably.  
5. Optional second test user/org for cross-tenant browser negatives.  
6. Authorize Task #19 only after accepting PARTIAL residual risk.

---

## 16. Recommendation for Task #19

**Do not authorize production deployment yet.**

Local product is substantially healthier: hardcoded 855 leak fixed, mobile nav fixed, controlled end-to-end PDF+Drive green, tests 200/200. Deployment should wait on env/Drive/geocode readiness and an explicit product decision on 855 acceptance blockers.
