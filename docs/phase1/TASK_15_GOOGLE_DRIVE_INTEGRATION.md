# Task #15 — Google Drive report backup integration

**Date:** 2026-11-18 (status review)  
**Project:** `mqsvrastpdratvzuouxk`  
**Strict:** No Vercel, no commit/push, no DB reset, no auto-approve 855 comps, no unapproved migration apply.

## Axis results (implementation vs live)

| # | Item | Code / mocked | Live integration |
|---|------|---------------|------------------|
| 1 | Google Drive auth architecture | **PASS** | **BLOCKED** (no OAuth creds) |
| 2 | Property-specific folder configuration | **PASS** | **BLOCKED** (migration + creds) |
| 3 | Finalized PDF backup | **PASS** (mocked) | **BLOCKED** |
| 4 | Automatic backup after finalization + manual retry | **PASS** | **BLOCKED** |
| 5 | Durable upload idempotency / duplicate prevention | **PASS** | **BLOCKED** (needs live Drive) |
| 6 | Successful backup confirmation | **PASS** (code + mocked) | **BLOCKED** |
| 7 | Report history and Drive status | **PASS** | **PARTIAL** (UI ready; Drive columns need migration) |
| 8 | Tenant isolation + secure credentials | **PASS** | **PASS** (no tokens in browser; no Drive live yet) |
| 9 | Required database migrations | **PASS** (prepared) | **BLOCKED** (unapplied; needs auth) |
| 10 | Local UI integration | **PASS** | **PARTIAL** (screens wired; Drive ops unavailable) |
| 11 | Live Google Drive API verification | — | **BLOCKED** |

**Overall:** **PARTIAL** — implementation complete locally; live Drive blocked on credentials + unauthorized migration.

---

## 1. Google Drive authentication architecture — PASS (code) / BLOCKED (live)

- Official `googleapis` Drive v3 client (`src/lib/google-drive/client.ts`)
- **OAuth refresh token** for a dedicated PKL Google account (not service account for ordinary My Drive)
- Scope default: `https://www.googleapis.com/auth/drive.file` (`GOOGLE_DRIVE_SCOPES` optional)
- Server-only env; never `NEXT_PUBLIC_`
- Setup helper: `scripts/google-drive-oauth-setup.mjs`

**Live:** `GOOGLE_DRIVE_CLIENT_ID` / `SECRET` / `REFRESH_TOKEN` all **MISSING** in `.env`.

## 2. Property-specific folder configuration — PASS (code) / BLOCKED (live)

- Org reports root: `GET/POST /api/drive/status`, `/api/drive/root` (owner/admin)
- Property: associate existing folder or create under root (`/api/properties/:id/drive`, `/drive/create`)
- Human-readable folder names; reuse same-named child (no duplicate create)
- UI: Settings + property detail

**Live:** needs migration `20260319200000` + Drive credentials.

## 3. Finalized PDF backup — PASS (mocked) / BLOCKED (live)

- Reads immutable snapshot + private `generated-reports` final path (`final-v*`)
- Rejects drafts / incomplete reports
- Meaningful Drive filenames; no public sharing
- Marks `saved_to_drive` only after Drive confirms
- Mocked unit tests cover upload, replay, permission failure

## 4. Automatic backup after finalization + manual retry — PASS (code) / BLOCKED (live)

Added `attemptAutomaticDriveBackup` (`src/lib/google-drive/auto-backup.ts`):

| Trigger | Behavior |
|---------|----------|
| `POST …/pdf/finalize` after final PDF stored | Best-effort backup if status is already `sent` + folder assigned |
| `POST …/transition` → `sent` (Mark as completed) | Best-effort backup if final PDF + folder exist |
| Failure | Primary finalize/complete still succeeds; `drive_backup_error` recorded |
| Manual | `POST /api/reports/:id/drive` + PDF workspace “Retry Google Drive backup” |

Finalize and Drive remain distinct statuses until Google confirms.

## 5. Durable upload idempotency / duplicate prevention — PASS

- Route-level `runIdempotent` on backup POST
- Drive `appProperties.pkl_backup_token` content fingerprint → no duplicate files
- Same-key replay / already_saved short-circuit
- Concurrent create-folder coalesced via idempotency

Cross-instance durable keys use applied `api_idempotency_keys` migration. Live Drive duplicate proof still blocked without credentials.

## 6. Successful backup confirmation — PASS (code)

- Verifies mime/size after upload
- Persists Drive file id, web view link, timestamp, checksum fields (when migrated)
- Status → `saved_to_drive` only after confirm
- UI success toast + Open in Google Drive link

## 7. Report history and Drive status — PASS (UI) / PARTIAL (live schema)

- History lists `savedToDriveAt`, backup error, Open in Drive
- PDF workspace shows blockers / folder / retry
- Dashboard counts Saved to Google Drive

Without task15 migration, some Drive columns fall back gracefully.

## 8. Tenant isolation and secure credential handling — PASS

- `requireAuth` + org membership on every Drive endpoint
- Owner/admin for org root
- Tokens server-only; API responses omit raw folder/file ids where possible
- Manual `saved_to_drive` transition rejected
- Cross-tenant denied via property/report membership + RLS

## 9. Required database migrations — PASS prepared / BLOCKED apply

| Migration | Local | Remote | Notes |
|-----------|-------|--------|-------|
| `20260319200000_task15_google_drive.sql` | yes | **no** | Needs explicit authorize-only apply |
| `20260317210000_task09_narrative_metadata.sql` | yes | **no** | **Do not apply** with Drive |

Do **not** `db push` (would pull task09).

## 10. Local UI integration — PASS

Settings, property Drive folder, PDF Save/Retry, report history Drive columns — all wired. No redesign.

## 11. Live Google Drive API verification — BLOCKED

No OAuth credentials; migration unapplied; no real upload performed. Mocked tests are **not** claimed as live PASS.

---

## Exact Google Cloud + env setup (live)

1. Google Cloud project → enable **Google Drive API**
2. OAuth consent + Desktop (or Web) client with redirect `http://localhost:3000/oauth2callback`
3. Run:

```bash
GOOGLE_DRIVE_CLIENT_ID=... \
GOOGLE_DRIVE_CLIENT_SECRET=... \
node scripts/google-drive-oauth-setup.mjs
```

4. Put refresh token in local `.env` only
5. Create reports root folder; set in Settings
6. Authorize apply of **only** `20260319200000_task15_google_drive.sql`

### Environment variables

| Variable | Required for Drive live | Present now |
|----------|-------------------------|-------------|
| `GOOGLE_DRIVE_CLIENT_ID` | yes | **MISSING** |
| `GOOGLE_DRIVE_CLIENT_SECRET` | yes | **MISSING** |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | yes | **MISSING** |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | optional | **MISSING** |
| `GOOGLE_DRIVE_SCOPES` | optional (default `drive.file`) | **MISSING** |

---

## Consolidated outstanding external credentials

| Integration | Variables | Status in `.env` | Effect if missing |
|-------------|-----------|------------------|-------------------|
| **Google Drive** | `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN` (+ optional root/scopes) | **All missing** | Backup/folder APIs return friendly “not connected”; auto-backup skips |
| **Google Geocoding** | `GOOGLE_GEOCODING_API_KEY` (or `GOOGLE_MAPS_API_KEY`) | **Missing** | MLS distances unavailable |
| **Anthropic Claude** | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | **Set** | Live Claude drafts available (model set) |

Also still outstanding (not Google/Anthropic): authorize task15 migration; leave task09 unapplied.

---

## Automated verification (this review)

```
npm test          # includes Drive naming/backup/auto-backup unit tests
npm run typecheck
npm run lint
npm run build
```

Results recorded after the verification pass in this session.

---

## Remaining blockers for live Drive PASS

1. Provide Google OAuth client + refresh token for the PKL Drive account  
2. Explicitly authorize apply of **only** `20260319200000_task15_google_drive.sql`  
3. Configure org root + Dbg Org test property folder  
4. Complete a test report (do not mutate 855 client comps) and confirm real Drive file + status  

---

## Kent — short setup checklist

1. Enable Drive API → create OAuth Desktop client  
2. Run `scripts/google-drive-oauth-setup.mjs` as the PKL Drive account  
3. Add the three required `GOOGLE_DRIVE_*` values to local `.env` only  
4. Ask eng to apply **only** the Task 15 migration (not task09)  
5. Settings → Select report folder  
6. Property → Create under reports root (or paste folder)  
7. Mark a test report completed with final PDF → confirm automatic Save to Google Drive (or use Retry)  
8. Confirm Open in Drive; files must not be public  

---

## Global UX cleanup note

Accepted separately; not re-run in this review. Permanent standards remain in `AGENTS.md`.
