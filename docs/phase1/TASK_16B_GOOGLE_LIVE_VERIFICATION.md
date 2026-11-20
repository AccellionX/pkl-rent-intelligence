# Task #16B — Live Google integration verification

**Date:** 2026-11-18  
**Project:** `mqsvrastpdratvzuouxk`  
**Strict:** Localhost only · no Vercel · no commit/push · no client-comp approvals · no credential exposure · no destructive DB ops

## Overall: **PARTIAL**

Drive live path **PASS**. Geocoding **BLOCKED** (GCP billing required). Browser Drive UI **PASS**.

| Axis | Result |
|------|--------|
| Google Drive authentication | **PASS** |
| Refresh-token exchange | **PASS** |
| Root folder access | **PASS** |
| Property folder configuration | **PASS** |
| Automatic PDF backup | **PASS** |
| Actual PDF integrity | **PASS** |
| Duplicate prevention | **PASS** |
| Retry behavior | **PASS** |
| Report history | **PASS** |
| Browser verification | **PASS** |
| Google Geocoding | **BLOCKED** (billing) |
| Security and privacy | **PASS** |

---

## 1. Environment verification

| Variable | Present |
|----------|---------|
| `GOOGLE_DRIVE_CLIENT_ID` | SET |
| `GOOGLE_DRIVE_CLIENT_SECRET` | SET |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | SET |
| `GOOGLE_DRIVE_SCOPES` | `https://www.googleapis.com/auth/drive.file` |
| `GOOGLE_GEOCODING_API_KEY` | SET |
| `ANTHROPIC_API_KEY` / model | SET |
| Migrations (task09 + task15) | Applied (synced remote) |

Dev server restarted so Next.js loaded Drive/geo env. `/api/health` → `mode: live`.

Values never printed in logs or this document.

---

## 2. Drive authentication & refresh token — PASS

- Live `oauth2.getAccessToken()` succeeded (access token obtained; not logged).
- `drive.about.get` returned connected account on **gmail.com** domain.
- Scope remains **`drive.file`** only (no full Drive access).

### OAuth Testing-mode risk (document for production)

Refresh tokens issued while the Google Cloud OAuth consent screen is in **Testing** can expire after ~7 days and/or when the test user is removed. For durable production backup:

1. Publish the OAuth app (or use an Internal/Workspace app).
2. Re-run `scripts/google-drive-oauth-setup.mjs` after publishing if tokens were Testing-only.
3. Keep `access_type=offline` + `prompt=consent` (already in the setup script).
4. Monitor Drive connection errors in Settings; reconnect when refresh fails (`invalid_grant`).

---

## 3. Root folder — PASS

**Defect fixed:** with `drive.file`, pasted manually created folders are inaccessible. Added app-created root:

- API: `POST /api/drive/root` with `{ create: true, folderName: "PKL DEV Reports" }`
- UI: **Create reports root folder** / **Recreate / reuse reports root**
- Reuse by exact name under My Drive `root` (no duplicate roots)

Verified: root name **PKL DEV Reports**, connection error null, connected account present, second create reuses same name.

---

## 4. Property folder — PASS

- Property: **Fourteen B Test Property** (Dbg Org only)
- Created under reports root: **Fourteen B Test Property (Providence, RI)**
- Accessible = true
- Second create blocked (already assigned)
- No unrelated personal Drive files listed or accessed

---

## 5. Complete report backup — PASS

Controlled synthetic comps on Dbg Org only (not 855 / not client approvals).

| Step | Result |
|------|--------|
| Seed 2 approved test comps | OK |
| Create report + PKL rent range | OK |
| Live Claude narrative (`usedLiveClaude: true`) | OK |
| Approve + snapshot | OK |
| Finalize PDF | OK (~31 719 bytes) |
| Transition `in_progress` → `waiting_on_review` → `sent` | OK |
| Automatic Drive backup on `sent` | **PASS** → status `saved_to_drive` |

Example Drive file name (unique per report run):

`Fourteen B Test Property — 1BR Test — 2026-11-10 — v1 — 540c5d93.pdf`

---

## 6. PDF integrity — PASS

| Check | Result |
|-------|--------|
| Storage vs Drive byte length | Equal (31719) |
| SHA-256 match | **Yes** |
| Parent folder count | 1 |
| Public / anyone permission | **None** |

---

## 7. Duplicate prevention — PASS

| Check | Result |
|-------|--------|
| Repeat `POST …/drive` while already saved | `already_saved` / replayed |
| Same unique filename count in folder | **1** |

**Fixes this task:**

1. Filename includes short report id (avoids cross-run collisions).
2. Upload dedupe: appProperty token **plus** same name+size fallback (retry after DB clear).

---

## 8. Retry / failure recovery — PASS

| Check | Result |
|-------|--------|
| Backup with invalid folder | Failed (400); status not saved |
| Final PDF retained in storage | **Yes** |
| Restore folder + manual retry | `saved_to_drive` |
| No extra Drive file for same unique name | Count remained **1** |

---

## 9. Report history — PASS

- Report status `saved_to_drive` with `saved_to_drive_at`
- Snapshot Drive file name / confirmation fields populated
- Property + report history UI show **Saved to Google Drive**

---

## 10. Browser verification — PASS

Local Cursor browser (Dbg Org admin session):

| Flow | Evidence |
|------|----------|
| Login / org | Signed in; Dbg Org active |
| Settings → Drive | Status **Connected**; root **PKL DEV Reports**; Open folder link; no secrets/API keys |
| Property | Task16B reports show **Saved to Google Drive** |
| PDF workspace | Selected Task16B report → **Already saved to Google Drive** + **Open in Google Drive** |
| Report history | Lists Task16B + Saved to Google Drive |
| Pending/success | Create-root / save / refresh use pending buttons; success toasts |

Geocoding distances in UI: **not verified** (billing block).

---

## 11. Google Geocoding — BLOCKED

- Key **present** in `.env`
- Live Geocoding API returns **`REQUEST_DENIED`** with billing required on the Google Cloud project
- No coordinates fabricated; no alternate provider used
- Distances in UI/report remain unavailable until billing is enabled and the key is allowed for Geocoding API

**User action:** enable billing on the GCP project used for the Geocoding key, restrict the key to Geocoding API, restart `npm run dev`, re-run distance checks on Dbg Org / Task7 MLS subject.

---

## 12. Security and privacy — PASS

- Credentials server-only; never returned to browser payloads as tokens
- Scope limited to `drive.file`
- Cross-tenant Drive status denied (403/404) for non-member user
- No public sharing on uploaded PDF
- Uploads only to app-created **PKL DEV Reports** / property folder
- UI: no Supabase/API key jargon; Drive file ids not shown in customer copy
- Synthetic Dbg Org comps only — no 855 client comparable approvals

---

## 13. Code changes (local, uncommitted)

- Create/reuse org reports root under My Drive (`createOrganizationDriveRootFolder` + Settings UI)
- Drive upload name+size dedupe; report-id in finalized PDF filename
- Live verifier: `scripts/task16b-google-live-e2e.mjs`

---

## 14. Automated verification

```
npm test         → 195 passed
npm run typecheck → pass
npm run lint      → pass
npm run build     → pass
node scripts/task16b-google-live-e2e.mjs → pass_drive_geo_partial
```

---

## 15. Outstanding blockers / next action

1. **Enable Google Cloud billing** for Geocoding → re-verify live distances + cache + UI.
2. Plan OAuth consent **production** publish before long-lived Drive refresh tokens are required beyond Testing.
3. Optional: trash leftover same-named PDFs from earlier failed duplicate runs in the DEV property folder (cosmetic).

---

## Evidence reference (no secrets)

- Script exit: `pass_drive_geo_partial`
- Report id used for integrity/dedupe proof: `540c5d93-fc4d-4279-b2e9-0749a4e65824`
- Auto-backup path: `automatic_after_sent`
- Connected account domain: `gmail.com`
