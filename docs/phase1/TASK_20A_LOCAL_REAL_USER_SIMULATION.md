# Task #20A — Local real-user simulation

**Verdict: PARTIAL**

Continuous browser journey completed for login → property → uploads → comps → narrative → PDF → Drive across multiple weekly periods on an isolated development property. Week 1–2 final PDF bytes were produced after snapshot/finalization blockers were fixed; week 3 was completed fully through the UI (create → approve/lock snapshot → Store final PDF → Mark as completed → Google Drive). Remaining gaps keep this from a clean PASS: subject photo UI reliability, Drive status briefly stale after completion, and Geocoding still unavailable.

---

## 1. Chronological customer journey

Property: **Twenty A Journey fso43** (`29865d36-23fb-4861-b43a-29d62f73ccf4`)  
Org: PKL Management LLC · User: `admin@pkl.com`

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Open `http://localhost:3000`, sign in | Success |
| 2 | Organization already active (PKL Management LLC) | Success |
| 3 | Create property via Properties → New property | Success — address `515 Journey Ave fso43`, Providence RI |
| 4–5 | Add unit type `2BR Journey` (2/1); add available unit | Unit type OK; available unit added on resume |
| 6–10 | Upload Rentometer CSV/PDF, HelloData PDF, RI MLS CMA, Zillow + Apartments.com Excel via Data Uploads (`setInputFiles`) | All six source uploads succeeded |
| 11–13 | Verify extracted identity | Marketing name **The Residences at Bold Point** and website `https://kettle-point.com` applied without re-entry |
| 14–18 | Comparables review — accept/exclude, set tiers | Initial accepts hit mismatched MLS 1BR rows (not eligible). Fixed by accepting Rentometer 2BR test comps with rent; 3+ eligible groups |
| 19–20 | Subject photos + crop | Partial — gallery sometimes stuck on Loading; later PDFs show **Photos: 4 on file** |
| 21–22 | Pricing KPIs + recommended range `$1,900–$2,100` | Saved |
| 23–24 | Generate Claude narrative, edit, approve | Live Claude draft generated; staff edit + approve |
| 25–26 | Weekly leads / tours / apps / feedback / actions | Agent notes saved |
| 27–28 | Preview / finalize PDF | Blocked initially (no snapshot UI; Mark completed used illegal `in_progress→sent`). Fixed, then finalized |
| 29 | Download/open final PDFs | Local inspect copies under `tmp/task20a/pdf/` |
| 30–31 | Google Drive folder + backup + history | Folder assigned; three weekly finals on Drive |

**Workflow 2 (weekly reuse)**  
- Week 2 report created for `2026-10-23 → 2026-10-29` with retained property identity/links.  
- Prior comps/narrative path reused; weekly Zillow/Apartments re-uploaded.  
- Separate final PDF + separate Drive file. Week 1 remains `saved_to_drive` unchanged.  

**Workflow 3 proof (UI-only after fixes)**  
- Week 3 (`2026-10-30 → 2026-11-05`) created, narrated, snapshot-locked, Store final PDF, Mark as completed, Drive backup — all via browser controls.

---

## 2. Browser actions and outcomes

- Playwright (Chromium) drove the continuous journey, including `setInputFiles` for OS file pickers.  
- Cursor browser opened localhost; after auth hydration, property overview and PDF Report pages were inspected (screenshots in `tmp/task20a/screenshots/`).  
- Scripts: `scripts/task20a-real-user-journey.mjs`, `scripts/task20a-resume-finalize.mjs`.

---

## 3. Screenshot evidence

Directory: `tmp/task20a/screenshots/` (65+ files), including:

- Upload confirmations (`03`–`08-upload-*.png`)
- Comparables review, pricing/narrative, weekly leads
- Create report form on PDF page
- Drive folder assigned, finalize/Drive completion (`complete-week1.png`, `week2-after-drive.png`, `week3-*.png`)
- Cursor browser captures (`cursor-*.png`)

---

## 4. First finalized PDF location

- Local: `tmp/task20a/pdf/INSPECT-2026-10-22-v1.pdf` (also `FINAL-2026-10-22-v1.pdf`)  
- Storage path: `…/reports/5d3a4863-…/final-v1-2026-11-18T18-28-49-016Z.pdf`  
- Pages: **3** · Branding: PKL MANAGEMENT LLC · Period ending **2026-10-22**  
- Drive: [Twenty A Journey fso43 — 2BR Journey — 2026-10-22 — v1 — 5d3a4863.pdf](https://drive.google.com/file/d/14cxKzZx-lTU65LPI2-4Sx5y4HxW3Ad7d/view?usp=drivesdk)

---

## 5. Subsequent weekly PDF locations

| Period end | Local file | Drive file |
|------------|------------|------------|
| 2026-10-29 | `tmp/task20a/pdf/INSPECT-2026-10-29-v2.pdf` | [v2 — 8bb9ed90](https://drive.google.com/file/d/1brdN6srceo3BVMj9_r-xrxJQ_ZM7T3Xb/view?usp=drivesdk) |
| 2026-11-05 (UI-only week 3) | `tmp/task20a/pdf/INSPECT-2026-11-05-v2.pdf` | [v2 — 1bad8cab](https://drive.google.com/file/d/1S70SHifp6cLRa2mCjZ1rDOAdOFwogQlb/view?usp=drivesdk) |

All inspected finals: **3 pages**, ~7.7MB, include subject identity, listing website, unit type, and photo count. Not claimed as client reference parity.

---

## 6. Google Drive backup verification

- Property folder created via UI: **Twenty A Journey fso43 (Providence, RI)** (`1_5C4r_kYef1Qky75A0nyc4vSz75r0rrd`)  
- Three report runs status **`saved_to_drive`** with distinct Drive file IDs  
- Confirmation timestamps recorded on report runs / snapshots  

---

## 7. Data reuse and persistence

| Check | Result |
|-------|--------|
| Marketing name / website retained across weeks | Yes |
| Unit type retained | Yes |
| Eligible comps reused for later weeks | Yes (3 eligible groups) |
| Photos referenced on later PDFs | Yes (“Photos: 4 on file”) |
| Week 1 unchanged after week 2/3 | Yes — separate runs/snapshots/Drive files |
| Browser refresh keeps session | Yes (Playwright) |
| Agent weekly notes preserved | Yes (recorded before narrative) |

---

## 8. Bugs identified and fixed

1. **No Create report UI** on PDF page — empty state told staff to create a report with no form.  
   - Fixed: Create report card (title, unit type, period, prepared by) → `POST /api/properties/[id]/reports`.

2. **No Lock snapshot control** — Approve narrative did not create the immutable snapshot required by finalize; Store final failed with opaque snapshot error.  
   - Fixed: Approve auto-locks snapshot; explicit **Lock snapshot** on Pricing and PDF pages; clearer user-facing error copy.

3. **Mark as completed invalid transition** — UI called `in_progress → sent`; domain requires `waiting_on_review` first (`409`).  
   - Fixed: Mark as completed performs `in_progress → waiting_on_review → sent`; regression test added.

4. **PDF readiness stuck on “Checking…”** when status fetch failed.  
   - Fixed: loading/error/retry/refresh status UI.

5. **Photo gallery could hang on Loading** with no recovery.  
   - Fixed: 20s abort + Refresh photos control.

6. **Comparables list buried eligible Rentometer rows** under MLS/HelloData.  
   - Fixed: sort pending candidates (rentometer + rent first); show beds + “In pricing set” / “Needs unit-type data” on approved rows.

Regression tests: `tests/unit/comparables-review-sort.test.ts`, `tests/unit/report-status-complete-path.test.ts`.

---

## 9. Customer usability findings

- **Next action:** Improved after Create report + Lock snapshot + corrected Mark as completed; PDF page still has many simultaneous buttons (draft / lock / store / mark / Drive).  
- **Nontechnical clarity:** Professional copy overall; “Lock snapshot” is still slightly technical — mitigated by auto-lock on Approve.  
- **Re-entry:** Identity/website from HelloData filled empty fields; good.  
- **Confusing controls:** Accepting MLS comps against a 2BR unit type marks them approved but not in pricing — badge helps; staff can still accept mismatched beds without a pre-accept warning.  
- **Loading states:** Photo and account hydration can linger; PDF status retry helps.  
- **Messages:** Toast/errors mapped through user-facing helpers; Drive completion toast correct even when status panel briefly lagged.  
- **Mistake recovery:** Exclude + Refresh status + Lock snapshot retry paths work.  
- **Dead / misleading:** Pre-fix Mark as completed looked available but failed; Store final looked ready without snapshot — both fixed.

---

## 10. Automated test results

```
npm test       → 210 passed (42 files)
npm run typecheck → pass
npm run lint   → pass (0 errors; script warnings only)
npm run build  → pass
```

---

## 11. Remaining external dependencies

- **Google Geocoding billing** — deferred; distances may remain blank.  
- **Production / Vercel deploy** — deferred (local only).  
- Authentic client comparable approvals / reference PDF parity — out of scope for this isolated journey.

---

## 12. Final local customer journey verdict

**PARTIAL**

The platform was exercised as a continuous staff journey in the browser with real uploads, live Claude narrative, multi-week report reuse, finalized PDFs, and Google Drive backups on an authorized development property. Critical UX blockers discovered mid-journey were fixed and a third weekly report was completed end-to-end through the UI afterward.

Not PASS because: (a) early week finals required snapshot/finalization recovery after missing UI, (b) subject photo upload/loading remains intermittently unreliable in the gallery, (c) Drive status panel can briefly lag after Mark as completed, (d) Geocoding remains unavailable by design until billing.

---

## Artifact index

- Evidence: `tmp/task20a/evidence.json`, `tmp/task20a/resume-evidence.json`, `tmp/task20a/final-state.json`, `tmp/task20a/drive-complete.json`, `tmp/task20a/pdf-inspect.json`  
- PDFs: `tmp/task20a/pdf/`  
- Screenshots: `tmp/task20a/screenshots/`  
