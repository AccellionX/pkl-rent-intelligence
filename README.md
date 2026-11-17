# PKL Rent Intelligence

Rental pricing intelligence for **PKL Management LLC**.

The repository ships a polished **demo UI** (Zustand + localStorage, featured 30 Veterans 1BR workflow) plus a **Phase 1 live foundation** (Supabase Postgres/Auth/Storage + Next.js API routes). Demo and live modes do not mix data.

## Modes

| Mode | When | Behavior |
|------|------|----------|
| **Demo** | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` missing | Existing UI uses seed + localStorage. Live `/api/*` writes/lists return `503 demo_mode` and never fall back to seed data. |
| **Live** | Both public Supabase env vars set | Authenticated API access to org-scoped Postgres data with RLS. |

Check mode: `GET /api/health`.

## Stack

- Next.js 16 + React 19 + TypeScript  
- Tailwind CSS 4 + Radix UI  
- Zustand (demo persistence only)  
- Supabase (Postgres, Auth, Storage) for live mode  
- Zod validation, Vitest unit tests  
- jsPDF / SheetJS / Papa Parse (existing demo upload & PDF tools)

## Local development (demo)

Requires **Node.js 20.9+**.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No env vars required for demo mode.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Supabase setup (live mode)

1. Create a Supabase project.
2. Copy `.env.example` → `.env.local` and fill:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (**server only** — never `NEXT_PUBLIC_`)
3. Apply the foundation migration:

```bash
# With Supabase CLI logged into the project:
npx supabase db push
# or paste/run:
# supabase/migrations/20260317120000_phase1_foundation.sql
# in the Supabase SQL editor.
```

4. Confirm Auth is enabled and create a staff user.
5. Create an organization row (authenticated insert auto-adds the creator as `owner` via trigger).
6. Restart `npm run dev` and call authenticated APIs (session cookies via Supabase Auth).

### Storage

Migration creates private buckets:

- `source-documents`
- `report-photos`
- `generated-reports`

Object paths must start with `{organization_id}/…` so RLS can authorize access.

### Local verification checklist

- [ ] `GET /api/health` → `mode: "live"` when env is set  
- [ ] Unauthenticated `POST /api/properties` → `401`  
- [ ] Authenticated user **outside** an org cannot read that org’s properties (`403` / empty via RLS)  
- [ ] Demo UI still loads without env vars and keeps Veterans localStorage state  

Live DB connectivity is **not** claimed in CI without credentials.

## Demo journey (unchanged)

1. **Portfolio** → featured 30 Veterans Memorial Parkway  
2. **Property** → available units & amenities  
3. **Comparables** → nine 1BR comps from the source report  
4. **Pricing** → interactive rent adjustments + charts  
5. **Generate PDF** → branded downloadable pricing analysis  
6. **Report history / scheduling** → localStorage-backed demo state  

## Sample vs live data

| Area | Behavior |
|------|----------|
| Portfolio seed / Veterans fixture | Demo UI only (`src/data/*`, `src/store/demo-store.ts`) |
| `/api/properties`, `/api/reports`, … | Live mode + auth only; no seed fallback |
| CSV / Excel upload page | Still client-side demo parsing |
| PDF upload page | Still simulated extraction |
| Phase 1 schema / RLS / calc stubs | `supabase/migrations`, `src/domain`, `src/lib/calculations` |

## Project structure

```
src/
  app/                 # App Router pages + /api handlers
  components/          # UI, layout, charts
  data/                # Demo types + Veterans/portfolio seed
  domain/              # Live-mode domain types, Zod schemas, status rules
  lib/
    supabase/          # Browser/server/admin clients + env/mode
    auth/              # Session + org authorization helpers
    api/               # Response/error/parse helpers
    calculations/      # Pure calc interfaces (formulas pending)
    privacy/           # Client-report PII guards
  store/               # Zustand demo store
  proxy.ts             # Supabase session refresh (live mode)
supabase/
  migrations/          # SQL foundation + RLS + storage
docs/phase1/           # Audit + task reports
tests/unit/            # Vitest coverage for foundation rules
```

## Phase 1 docs

- `docs/phase1/EXISTING_CODEBASE_AUDIT.md`
- `docs/phase1/TASK_02_FOUNDATION_REPORT.md`

## Vercel

Demo deploys without env vars. For live mode, set the Supabase env vars in the Vercel project (service role as a **server** secret only).
