# PKL Rent Intelligence

Commercial rental pricing and leasing intelligence for **PKL Management LLC**.

This repository contains the **Phase 1** application: authenticated, org-scoped property workflows (uploads, comparable review, pricing narrative, weekly metrics, branded PDF, optional Google Drive backup).

**Owner:** AccellionX (private backup / eventual client handover)  
**Status:** Local engineering acceptance and local customer journey **passed**. Production deployment is **deferred**. Milestone 1 is the only formally submitted milestone.

## What is verified vs outstanding

| Scope | Status |
|-------|--------|
| Local live app (auth, CRUD, uploads, review, narrative, PDF, Drive UX) | Verified locally |
| Automated suite (`npm test` / typecheck / lint / build) | Verified |
| Contractual 855 numerical parity / client comparable decisions | Outstanding |
| Google Geocoding billing for MLS distances | Outstanding |
| Veterans gold PDF reference parity | Outstanding |
| Production / Vercel deployment | Not authorized yet |

See `docs/phase1/TASK_22_REPOSITORY_RELEASE_READINESS.md` and prior Phase 1 task reports under `docs/phase1/`.

## Stack

- Next.js 16 + React 19 + TypeScript  
- Tailwind CSS 4 + Radix UI  
- Supabase (Postgres, Auth, Storage) with RLS  
- Anthropic Claude (optional narrative drafts)  
- Google Drive OAuth (optional finalized PDF backup)  
- Google Geocoding (optional MLS distances)  
- Vitest unit/integration tests  

## Prerequisites

- Node.js **20.9+** (see `.nvmrc`)  
- npm (lockfile: `package-lock.json`)  
- A Supabase project with Phase 1 migrations applied  
- Local `.env` from `.env.example` (never commit secrets)

## Quick start (live local)

```bash
npm install
cp .env.example .env
# Fill REQUIRED Supabase values (see Environment below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → Sign in with a staff account that belongs to an organization.

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Environment

Full variable list, required vs optional, and server-only vs browser-safe: **`.env.example`**.

| Category | Variables | Notes |
|----------|-----------|--------|
| Required (live) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Anon is browser-safe; service role is **server-only** |
| Optional AI | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Server-only; fallback draft if unset |
| Optional geo | `GOOGLE_GEOCODING_API_KEY` | Server-only; needs GCP billing |
| Optional Drive | `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, … | Server-only; dedicated PKL Google account |
| Optional CLI | `SUPABASE_ACCESS_TOKEN`, `DATABASE_URL` | Local machine only |
| Local e2e only | `PKL_E2E_EMAIL`, `PKL_E2E_PASSWORD`, `PKL_CLIENT_SOURCE_DIR` | Never commit values |

Demo fixtures activate only when `PKL_ALLOW_DEMO_MODE=true` (never on customer hosts).

## Database migrations

Apply SQL in timestamp order against the target project (reconcile history before any `db push` — migrations were previously applied manually):

```text
supabase/migrations/20260317120000_phase1_foundation.sql
supabase/migrations/20260317140000_task03_source_document_pipeline.sql
supabase/migrations/20260317160000_task04_hellodata_conflicts.sql
supabase/migrations/20260317170000_task05_grants_schema_reload.sql
supabase/migrations/20260317180000_fix_org_select_rls_for_returning.sql
supabase/migrations/20260317190000_task06_mls_geocode_photos.sql
supabase/migrations/20260317200000_task08_weekly_reporting.sql
supabase/migrations/20260317210000_task09_narrative_metadata.sql
supabase/migrations/20260318200000_task14b_idempotency_keys.sql
supabase/migrations/20260319200000_task15_google_drive.sql
```

Helper (requires `DATABASE_URL` / `SUPABASE_DB_URL` locally):

```bash
npm run task05:migrate
```

Do **not** reset the remote database. Do **not** apply migrations without authorization.

Private storage buckets (created by migrations): `source-documents`, `report-photos`, `generated-reports`.

## Claude narrative

1. Create an Anthropic API key owned by the PKL / AccellionX organization.  
2. Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) in server env.  
3. Generate / edit / Approve on Pricing & Reports. Approve locks an immutable PDF snapshot.

Without a key, staff still get a deterministic draft they can edit and approve.

## Google Drive OAuth

1. Google Cloud project with Drive API enabled.  
2. OAuth Desktop client; redirect `http://localhost:53682/oauth2callback`.  
3. Run:

```bash
GOOGLE_DRIVE_CLIENT_ID=... GOOGLE_DRIVE_CLIENT_SECRET=... node scripts/google-drive-oauth-setup.mjs
```

4. Store the refresh token as `GOOGLE_DRIVE_REFRESH_TOKEN` in server env only.  
5. Prefer a dedicated PKL Google account that owns the reports root folder.  
6. In the product: property → Google Drive backup → create/link folder; PDF workspace → Save to Google Drive after completion.

## Google Geocoding

1. Enable Geocoding API on a billed GCP project.  
2. Set `GOOGLE_GEOCODING_API_KEY` server-side.  
3. Without billing/key, MLS distance fields remain unavailable (no invented miles).

## Architecture (overview)

```
src/app/                 # App Router pages + /api
src/components/          # UI (live property, PDF, Drive, photos, …)
src/domain/              # Types, Zod schemas, lifecycle rules
src/lib/
  supabase/ auth/ api/   # Clients, session, envelopes
  extraction/            # Rentometer, HelloData, MLS, weekly parsers
  reports/ pdf/          # Assembly, narrative, PDF render
  google-drive/          # Backup + naming + content identity
  ui/                    # Staff-facing labels and error mapping
supabase/migrations/     # Phase 1 schema + RLS + storage
tests/                   # Vitest (synthetic fixtures committed)
scripts/                 # Local engineering e2e (env-gated credentials)
docs/phase1/             # Task reports and readiness docs
```

Report lifecycle: `in_progress` → `waiting_on_review` → `sent` → `saved_to_drive`.

## Confidential data policy

- **Do not commit** `.env`, OAuth tokens, client PDFs/XLSX/photos, `tmp/` evidence, or database dumps.  
- Synthetic fixtures under `tests/fixtures/` are safe and required for CI.  
- Real client source packages stay on the local machine; point scripts with `PKL_CLIENT_SOURCE_DIR`.  
- Staff-facing UI never shows infrastructure jargon (see `AGENTS.md` content standards).

## Production deployment checklist (not authorized yet)

- [ ] Repository is **private**  
- [ ] Secrets only in host env (never in git)  
- [ ] Service role / Drive / Anthropic keys are org-owned  
- [ ] Migrations reconciled on target project  
- [ ] `PKL_ALLOW_DEMO_MODE` unset  
- [ ] Auth users provisioned for PKL staff  
- [ ] Google Drive root owned by PKL account  
- [ ] Explicit written authorization to deploy  

## License / confidentiality

Private AccellionX repository. Client source materials and credentials are confidential and are not part of the public surface of this project.
