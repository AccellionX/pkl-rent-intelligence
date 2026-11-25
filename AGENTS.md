<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:pkl-supabase-cli-first-rules -->

## PKL Supabase development — CLI-first / API-first

These rules apply to **all subsequent Cursor tasks** on this repository.

### Preferred tools (in order)

1. **Supabase CLI** for project linking, migrations, schema inspection, migration history, and database verification.
2. **PostgreSQL/SQL** for direct database diagnostics where appropriate.
3. **Supabase JS SDK**, Auth API, Storage API, and PostgREST for authenticated integration tests.
4. Prefer **terminal commands and automated tests** over navigating the Supabase dashboard.
5. Use **browser automation only** when an actual graphical workflow must be verified, or when CLI/API access cannot perform the operation **and** the user has been asked first.

### Migrations and safety

6. Before any migration: inspect pending changes, validate the target project, and use dry-run where supported.
7. Target project is **`mqsvrastpdratvzuouxk`**. Never reset the remote database or perform destructive operations.
8. Migrations were previously applied **manually**. Always **reconcile** existing database schema and migration history before any future `db push`. Do **not** blindly reapply migrations.
9. Keep access tokens and database credentials in secure local environment variables. Never print, commit, or expose them.
10. If CLI authentication or database credentials are missing, report the **exact missing prerequisite** rather than switching to browser automation without asking.
11. Do not deploy or change production resources without **explicit authorization**.

### Expected local prerequisites

- Linked CLI project to `mqsvrastpdratvzuouxk` (`supabase link`)
- `DATABASE_URL` or `SUPABASE_DB_URL` (session/pooler URI) for CLI DB operations when required
- `SUPABASE_ACCESS_TOKEN` for Management API / CLI login when required (local env only)
- Existing app keys in `.env`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

<!-- END:pkl-supabase-cli-first-rules -->

<!-- BEGIN:pkl-user-facing-content-standards -->

## PKL user-facing content standards (permanent)

These rules apply to **all** UI, API error envelopes that reach the browser, toast copy, empty states, and PDF-adjacent messaging.

### Product voice

1. PKL Rent Intelligence must read as a professional commercial SaaS product for property-management staff — never as a developer console.
2. Prefer short, natural English. Prefer action-specific loading copy and confirmed success toasts.
3. Business service names that staff use directly are allowed: Google Drive, Rentometer, HelloData, Zillow, Apartments.com, MLS.

### Never show customers

4. Do **not** surface: Supabase, PostgreSQL/PostgREST, Vercel, Railway, schemas, API endpoints, API keys, access tokens, JWTs/sessions jargon, RLS, storage buckets, UUIDs/internal ids, environment variables, demo/live/sample/mock/seeded labels, or implementation notes.
5. Do **not** explain authentication infrastructure on the login page. Use: “Sign in to your account” / “Enter your email and password to continue.”
6. Route all unexpected errors through `toUserFacingError` / `apiErrorMessage`. Map known failures accurately (credentials vs outage vs permission vs missing integration). Never show stack traces, HTTP status codes, SQL, or raw provider dumps.
7. Keep underlying enums and security behavior unchanged; only labels and messages change. Report lifecycle values stay: `in_progress` → `waiting_on_review` → `sent` → `saved_to_drive`.
8. Technical diagnostics belong in secure server logs only — never in UI copy, and never with secrets or personal data.

### Shared helpers

9. Use `src/lib/ui/status-labels.ts` for status badges and `src/lib/ui/user-facing-error.ts` for errors.
10. Prefer `Button` `pending` + `usePendingAction` for mutations; avoid duplicate submissions and endless spinners.

<!-- END:pkl-user-facing-content-standards -->

<!-- BEGIN:pkl-guided-workflow-and-persistent-review -->

## PKL guided report workflow & persistent review (permanent)

These rules apply to all report UX and source-document review work.

### Property setup vs weekly reports

1. Property setup (identity, amenities, unit types, available units, subject photos, Drive folder) is a **persistent workspace**, not a weekly step.
2. Do not force re-entry of confirmed property details or re-upload of unchanged documents for each weekly report.
3. Recurring reports reuse confirmed property facts, comparable building sets, photos, and links; refresh period-specific weekly data and changed rents.

### Guided report stepper (client order)

4. Report work uses a guided stepper scoped to property + unit type + reporting period + report run:
   1. Upload documents
   2. Confirm comparable data
   3. Choose subject photos
   4. Choose comparable photos
   5. Resolve rent conflicts
   6. Review weekly performance
   7. Set pricing recommendation
   8. Preview and approve
   9. Download and save
5. Derive step completion from **persisted validated data**, never from mere navigation/visits.
6. Allow save/resume, logout/login, revisit earlier steps, and skip optional actions. Show the next recommended action and an accurate incomplete checklist.
7. If no report run exists, guide staff to start one before report-specific steps.

### Persistent document review

8. Uploaded originals, extractions rows, and review decisions must survive navigation, refresh, and re-login without re-upload.
9. Document center (global Data Uploads and property workspace) must show the same underlying records with human-readable status, extracted/remaining counts, and a working Review / Continue review action.
10. Counters must agree with the review UI. Never claim rows are ready for review while providing no way to review them — route each extraction type to its correct surface (comparables, weekly, property setup, pricing).
11. Subject property fields may only be filled from **subject-associated** data. Never copy a comparable website/listing into the subject.
12. Weekly current-period figures must come from the selected reporting period only — never silently promote older weeks as current.

<!-- END:pkl-guided-workflow-and-persistent-review -->

