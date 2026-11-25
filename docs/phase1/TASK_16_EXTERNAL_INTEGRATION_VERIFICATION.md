# Task #16 — External integration activation and verification

**Date:** 2026-11-18  
**Project:** `mqsvrastpdratvzuouxk`  
**Strict:** Localhost only · no Vercel · no commit/push · no unapproved migration apply · no auto-approve 855 comps · no fabricated live PASS.

## Axis results

| Axis | Result | Evidence type |
|------|--------|---------------|
| **Claude (Anthropic)** | **PASS** | Live API + browser |
| **Geocoding (Google)** | **BLOCKED** | Missing `GOOGLE_GEOCODING_API_KEY` |
| **Google Drive** | **BLOCKED** | Missing OAuth credentials + unapplied migration |
| **Migrations** | **PASS (review only)** | Dry-run inspected; **not applied** |
| **Browser verification** | **PARTIAL** | Claude UI PASS; Drive/geo UI blocked |
| **Security / privacy** | **PASS** | Keys server-side; no PII in Claude assemble; friendly errors |

**Overall:** **PARTIAL** — Claude live verified; Geocoding + Drive blocked on credentials (and Drive also on unauthorized migration).

---

## 1. Claude live API results — PASS

### Credentials (presence only)

| Variable | Status |
|----------|--------|
| `ANTHROPIC_API_KEY` | **SET** |
| `ANTHROPIC_MODEL` | **SET** → `claude-sonnet-4-5-20250929` |

### Controlled live run

- Script: `scripts/task16-claude-live-e2e.mjs`
- Org / property: **Dbg Org** / **Fourteen B Test Property** (not 855 comps mutation)
- Report: `Task16 Claude live verification`

| Check | Result |
|-------|--------|
| `usedLiveClaude` | **true** (only after successful API; not key-presence alone) |
| Model | `claude-sonnet-4-5-20250929` (not `deterministic-*`) |
| Latency | **13529 ms** |
| Tokens | input **742** · output **510** |
| Structured sections | All five present (length-only logged) |
| Recommended rent range | Manual **2150–2250** preserved in draft (`2,150` / `2,250` forms accepted) |
| Invented figures | Rejected by validator; none observed |
| Edit → regenerate preserve | **PASS** (`HUMAN_EDIT_MARKER` kept) |
| Approve | **PASS** |
| Stale approve after rent change | **Blocked** (as required) |
| Idempotent replay (same key) | **PASS** (no duplicate paid path for same key) |
| Prospect PII in assemble | **privacyOk** |
| Deterministic fallback | **Not used** for the live claim |

Code fix this task: `usedLiveClaude` previously implied “key present”; now set **only** when `generateClaudeNarrative` returns `ok: true`. API failures fall back to a standard draft with friendly warning and **do not** claim live Claude.

### Browser (localhost)

- Signed in as ephemeral Task05 test user · active org **Dbg Org**
- Pricing → selected Task16 report → **Generate draft**
- Button entered pending (`aria-busy` / disabled) during request
- Success copy: **“Narrative draft generated”** (not the fallback “from available report data” message)
- Narrative textareas populated

### Verification modes

| Behavior | Mode |
|----------|------|
| Live Claude generate / tokens / model | **API-tested (live)** + **browser-tested** |
| Edit / preserve / approve / stale | **API-tested (live)** |
| `usedLiveClaude` accuracy | **Unit-tested** + live confirmed |
| Fallback-without-key | **Unit-tested** |

---

## 2. Geocoding live results — BLOCKED

### Implementation (already present)

- `src/lib/geo/geocode.ts` — Google Geocoding only; `geocode_cache` first; haversine miles
- Never fabricates coordinates; `skipped_no_key` / `failed` / `uncertain` statuses
- Server-only env: `GOOGLE_GEOCODING_API_KEY` or `GOOGLE_MAPS_API_KEY` (never `NEXT_PUBLIC_`)

### Credentials

| Variable | Status |
|----------|--------|
| `GOOGLE_GEOCODING_API_KEY` | **MISSING** |
| `GOOGLE_MAPS_API_KEY` | **MISSING** |

### Exact Google Cloud setup (user action)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select or create the PKL project.
2. **APIs & Services → Library** → enable **Geocoding API**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Restrict the key:
   - Application restriction: **IP** (local/dev egress) or none for local-only, then tighten for deploy later.
   - API restriction: **Geocoding API** only.
5. Add to **local `.env` only** (never commit):

```bash
GOOGLE_GEOCODING_API_KEY=your_restricted_key
```

6. Restart `npm run dev`.
7. Re-verify on a controlled Dbg Org subject + comparable (e.g. Task7 MLS subject), confirm:
   - formatted address accuracy
   - deterministic miles
   - second call hits `geocode_cache` (`cached: true`)
   - ambiguous addresses remain `uncertain` / flagged
   - distances appear in comparable review + assemble payload
8. Do **not** use Mapbox/OSM/other substitutes.

**Live geocode / distance / cache / UI distance:** not run — key absent. Unit haversine tests remain green (mocked math only).

---

## 3. Google Drive live results — BLOCKED

### Architecture (code PASS from Task #15)

- OAuth refresh-token + `drive.file` scope (`scripts/google-drive-oauth-setup.mjs`)
- `access_type=offline` + `prompt=consent` for durable refresh tokens
- Redirect: `http://localhost:3000/oauth2callback`
- Auto-backup after finalize/complete + manual retry
- Duplicate prevention via `appProperties` fingerprint
- Status `saved_to_drive` only after Drive confirms
- Final PDF remains in Supabase when Drive fails

### Credentials

| Variable | Status |
|----------|--------|
| `GOOGLE_DRIVE_CLIENT_ID` | **MISSING** |
| `GOOGLE_DRIVE_CLIENT_SECRET` | **MISSING** |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | **MISSING** |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | **MISSING** (optional) |

### Exact OAuth setup (user action)

1. Google Cloud project → enable **Google Drive API**.
2. OAuth consent screen: External or Internal as appropriate; add scopes including  
   `https://www.googleapis.com/auth/drive.file`.
3. For durable refresh tokens: publishing may be required for production users; for a dedicated PKL test account, keep consent in Testing and add that account as a test user. Use `prompt=consent` + `access_type=offline` (already in the setup script).
4. Create **OAuth Desktop** (or Web) client; authorized redirect URI:  
   `http://localhost:3000/oauth2callback`.
5. Run locally (do not commit output):

```bash
GOOGLE_DRIVE_CLIENT_ID=... \
GOOGLE_DRIVE_CLIENT_SECRET=... \
node scripts/google-drive-oauth-setup.mjs
```

6. Paste `GOOGLE_DRIVE_REFRESH_TOKEN` (and client id/secret) into local `.env` only.
7. Use an **authorized dedicated test Drive folder** owned by the PKL Drive account — never upload real client PDFs to a personal/dev folder.
8. Authorize migration apply (see §4), then: Settings → reports root → property folder → finalize controlled test report → confirm file identity/name/parent/size/timestamp → repeat backup (no duplicate) → fail/retry path → confirm Supabase PDF retained → confirm no public sharing.

### Browser (localhost)

Settings → Google Drive:

- Status: **Not connected**
- Friendly admin copy (no API key / Supabase / raw provider errors)
- “Connect Google Drive — Coming later” (setup is env/script based)

**Live upload / open-in-Drive / duplicate / retry:** not performed.

---

## 4. Migration safety review — PASS (review) / NOT APPLIED

### Remote history (`mqsvrastpdratvzuouxk`)

Applied through **`20260318200000`** (task14b idempotency).  
**Not** on remote:

| File | Notes |
|------|-------|
| `20260317210000_task09_narrative_metadata.sql` | Out-of-order vs already-applied `20260318200000` |
| `20260319200000_task15_google_drive.sql` | Forward of latest remote |

### Remote columns today (relevant)

- `report_runs`: `narrative_draft`, `narrative_approved` only (app already works via JSON in draft)
- `properties.drive_folder_id` exists
- `report_snapshots.drive_file_id`, `drive_confirmed_at` exist
- Task09 first-class narrative columns **absent**
- Task15 org/property/report Drive enrichment columns **absent**

### Safety

Both migrations are **forward-only**, `ADD COLUMN IF NOT EXISTS`, non-destructive, no data drops, no RLS policy removals. Task15 updates `protect_report_snapshot_immutability()` to keep payload immutable while allowing Drive confirmation fields to mutate — compatible with existing snapshot rows.

App compatibility:

- Narrative workflow **does not require** task09 columns (draft JSON path).
- Drive APIs **degrade gracefully** when extra columns missing; full confirmation UX needs task15.

### Out-of-order support

Dry-run:

```bash
supabase db push --linked --dry-run --include-all
```

Would push (not applied):

1. `20260317210000_task09_narrative_metadata.sql`
2. `20260319200000_task15_google_drive.sql`

`--include-all` is the supported way to apply the older unapplied task09 after a newer remote migration. **Do not** edit applied migrations or rewrite history. A new forward-dated copy is **unnecessary** if both are authorized together via `--include-all`.

### Exact apply commands (awaiting your authorization)

```bash
# 1) Dry-run again
supabase db push --linked --dry-run --include-all

# 2) After explicit authorization for BOTH pending migrations:
supabase db push --linked --include-all
```

Expected changes:

- Task09: narrative_* columns on `report_runs`
- Task15: org Drive root/error columns; property `drive_folder_name` / `drive_folder_verified_at`; report_runs Drive backup fields; snapshot Drive link/name/checksum; immutability trigger update; `NOTIFY pgrst`

**Not run in this task.** Stop and ask if unrelated pending migrations appear (none did).

Optional later: backfill `narrative_*` from existing `narrative_draft` JSON — not required for Phase 1 runtime.

---

## 5. Pending credentials and setup (action from you)

| Priority | What you need to provide / authorize |
|----------|--------------------------------------|
| 1 | `GOOGLE_GEOCODING_API_KEY` (restricted) in local `.env` |
| 2 | `GOOGLE_DRIVE_CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` via oauth setup script |
| 3 | Explicit OK to apply **both** pending migrations with `db push --include-all` (or say if you want a Drive-only forward migration instead) |
| 4 | Dedicated PKL **test** Drive folder for Dbg Org verification only |

Anthropic: already configured — no action.

---

## 6. Browser verification evidence

| Flow | Result |
|------|--------|
| Login / Dbg Org switch | PASS |
| Pricing → Generate draft (Task16 report) | **PASS** (live success message + pending button + sections filled) |
| Settings → Drive status | Friendly **Not connected** (expected) |
| Geocoding distances in UI | **Not verified live** (no key) |
| Drive upload / open file | **Not verified live** |

---

## 7. Security and privacy results — PASS

- Anthropic / Drive / Geocoding keys: server-only; never printed in this report
- Claude prompt builder redacts email/phone; assemble privacy check passed for controlled report
- Narrative API returns usage metrics only (no prompt/body dump)
- Drive Settings UI: no key/token leakage; no Supabase terminology
- Friendly provider failure messages (no raw Google/Anthropic stacks in customer UI)
- Pending buttons / idempotency reduce duplicate paid Claude calls
- No demo fallback in live mode (`/api/health` → `mode: live`, `demoExplicitlyAllowed: false`)

Minor note (non-blocking): Pricing UI still mentions “Claude” in helper copy; consider softer “AI-assisted” wording in a later polish pass.

---

## 8. Tests and build results

```
npm test         → 194 passed (35 files)  # was 193; +1 usedLiveClaude regression
npm run typecheck → pass
npm run lint      → pass
npm run build     → pass
```

Live scripts:

- `node scripts/task16-claude-live-e2e.mjs` → live Claude confirmed (`usedLiveClaude: true`)
- Geocoding / Drive live scripts → **not runnable** without credentials

---

## 9. Outstanding blockers

1. Google Geocoding API key  
2. Google Drive OAuth client + refresh token + dedicated test folder  
3. Explicit authorization to apply pending migrations (`--include-all`)  
4. After (2)+(3): live Drive backup proof on a controlled finalized PDF  

---

## 10. Recommended next action

1. Add **Geocoding** key → restart dev → verify distances on Dbg Org / Task7 MLS subject.  
2. Complete **Drive OAuth** setup into local `.env`.  
3. Reply authorizing:  
   `Apply both 20260317210000 and 20260319200000 via supabase db push --linked --include-all`  
4. Then re-run Task #16 Drive/geo live + browser proofs on Dbg Org only.

---

## Code changes in this task (local, uncommitted)

- Accurate `usedLiveClaude` + `claudeUsage` metrics through narrative workflow/API  
- Friendly Claude failure messages; no false live PASS on fallback  
- `scripts/task16-claude-live-e2e.mjs` controlled Dbg Org live verifier  
- Unit regression: live flag only on successful API  
