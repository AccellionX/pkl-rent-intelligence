# Task #13 — Authentication First & Customer-Facing Demo Removal

**Overall status:** **PARTIAL**  
**Date:** 2026-11-18  
**Project:** `mqsvrastpdratvzuouxk`  

Local authenticated app entry works. Deployed Vercel URL still serves an **old build without Supabase public env**, so customers still see the prior demo experience until env is set and a new deployment is authorized.

No commit / push / production deploy performed.

---

## 1. Root cause of login configuration error

### Symptom
Login showed: `Live mode is not configured — demo mode has no server login`  
UI showed Sample Data / Live Mode / demo navigation; pages usable without auth.

### Causes (stacked)

| # | Cause | Evidence |
|---|--------|----------|
| A | **Vercel missing public Supabase env** | `GET https://pkl-rent-intelligence.vercel.app/api/health` → `mode: "demo"`, `supabaseConfigured: false` while local health → `mode: "live"` |
| B | **Missing env activated demo mode** | `getAppMode()` previously returned `"demo"` whenever `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` were absent, then mounted sample portfolio UI |
| C | **Browser client could not read public env even when server could** | `readEnv(name)` used dynamic `process.env[name]`. Next.js only inlines `NEXT_PUBLIC_*` for **static** access (`process.env.NEXT_PUBLIC_SUPABASE_URL`). Browser `createSupabaseBrowserClient()` returned `null` → same login toast |
| D | **Soft auth UX** | Login was under “Account”; demo routes remained reachable when env missing |

Local `.env` is **not** available to Vercel. Required public keys must be set in Vercel Project Settings and the app redeployed.

---

## 2. Before / after entry behavior

| Step | Before | After |
|------|--------|-------|
| Open `/` unauthenticated | Sample portfolio dashboard | **307 → `/login`** |
| Open `/buildings` unauthenticated | Demo buildings | **307 → `/login?next=/buildings`** |
| `/login` | Badge Demo/Live; toast if browser client null | Dedicated PKL sign-in (email + password always visible when configured) |
| Missing env | Silent demo/sample UI | **`unconfigured`** + configuration card (required var **names** only) |
| Valid credentials | Often failed in browser (cause C) | Supabase Auth session → dashboard |
| Invalid password | — | Normal Auth error (`Invalid login credentials`) |
| Sign out | Partial | Clears session → `/login` |
| Nav | Demo vs Live switcher labels | Single Phase 1 nav + Sign out (no Sample/Live badges) |

---

## 3. Environment variables required

### Required on Vercel (Production + Preview if used)

| Name | Scope | Notes |
|------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public / browser | `https://mqsvrastpdratvzuouxk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public / browser | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Never `NEXT_PUBLIC_` |

### Optional

| Name | Purpose |
|------|---------|
| `NEXT_PUBLIC_APP_URL` | Absolute app URL |
| `PKL_ALLOW_DEMO_MODE=true` | **Dev/test only** — enables isolated demo fixtures. **Do not set on customer Vercel.** |
| `ANTHROPIC_API_KEY`, `GOOGLE_GEOCODING_API_KEY`, `PDF_RENDERER`, `DATABASE_URL` | Existing Phase 1 optional server features |

### Mode policy (new)

- Public URL + anon present → **`live`**
- Else if `PKL_ALLOW_DEMO_MODE=true` → **`demo`** (tooling only)
- Else → **`unconfigured`** (clear failure, **no sample portfolio**)

---

## 4. Customer-facing demo elements removed

- Topbar **“Sample data”** badge (and nonfunctional notification/avatar chrome)
- Sidebar **Demo mode / Live mode** footer and demo nav (30 Veterans, Demo Settings)
- Page fallthrough to `DemoPortfolioDashboard`, `DemoBuildingsPage`, `DemoBuildingDetail`, Veterans demo pricing/comps/leads/reports for customer routes
- Settings demo store reset / sample inventory UI
- ModeGate blocks `demo` / `unconfigured` from mounting sample surfaces

Demo fixture modules remain in the repo for explicit `PKL_ALLOW_DEMO_MODE` / tests only.

---

## 5. Auth redirects and logout

- `src/proxy.ts`: refreshes cookies when configured; redirects unauthenticated app pages to `/login` with safe `next`; authenticated `/login` → `/` (or safe next)
- APIs still enforce `requireAuth` + org/property authorization (client guards are not security)
- Sidebar + Settings: **Sign out** → `supabase.auth.signOut()` → `/login`

---

## 6. Organization selection

- `/api/me` returns memberships, `propertyCount`, `suggestedOrganizationId`
- Single org → auto-select
- Multiple → accessible switcher (only when >1)
- Zero → “No organization access” state
- `localStorage` preference only applied if it matches a **validated membership**

---

## 7. Actual browser authentication results (local)

| Check | Result |
|-------|--------|
| Login page shows Email + Password | **PASS** (browser snapshot) |
| Fill React-controlled inputs + Sign in | **PASS** → redirected to `/` dashboard with session email |
| Invalid password (API Auth) | **PASS** — `Invalid login credentials` |
| Valid login + `/api/me` + dashboard | **PASS** |
| Unauth `/buildings` | **PASS** — `307` → `/login?next=%2Fbuildings` |
| Logout → `/api/me` | **PASS** — `401 unauthorized` |
| No Sample data / Live mode badges after login | **PASS** (post topbar fix) |

---

## 8. Live Vercel configuration status

| Check | Result |
|-------|--------|
| `https://pkl-rent-intelligence.vercel.app/api/health` | `mode: "demo"`, `supabaseConfigured: false` |
| Linked Vercel CLI in this workspace | Not linked (`vercel link` not run; no deploy) |
| Conclusion | Deployed build ≠ current local source; public Supabase env **not** present on that deployment |

After this task’s code is deployed **with** public env set, health should report `mode: "live"` (or `unconfigured` with named missing vars if still incomplete — never silent sample UI).

---

## 9. Regression test results

| Command | Result |
|---------|--------|
| `npm test` | **121 passed** (26 files) |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

New/updated coverage: `tests/unit/auth-entry.test.ts`, `demo-mode-api.test.ts`, `auth-boundaries.test.ts`, `upload-api-demo.test.ts` — unconfigured ≠ demo; no seed fallback.

---

## 10. Deployment prerequisites (exact steps — no secrets printed)

1. In **Vercel → Project → Settings → Environment Variables**, set for **Production** (and Preview if used):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only)
2. Confirm **PKL_ALLOW_DEMO_MODE** is **unset** on Vercel.
3. Confirm Supabase Auth Site URL / redirect allow-list includes `https://pkl-rent-intelligence.vercel.app` (and local `http://localhost:3000` for dev).
4. **Authorize** a new deployment of the current branch/build (this task did not deploy).
5. Verify: `curl -s https://pkl-rent-intelligence.vercel.app/api/health` → `mode:"live"`, `supabaseConfigured:true`.
6. Open the Vercel URL unauthenticated → should land on `/login` (not sample portfolio).
7. Sign in with a real org member → dashboard with real org data; Sign out → `/login`.

---

## 11. Remaining blockers

1. **Vercel still on old build + missing public env** — customer URL will not show this fix until env + authorized redeploy.
2. Comp **final PDF** still requires human approval (unchanged Task #10A).
3. Repo still contains demo fixture modules for opt-in tooling; they are gated out of customer ModeGate paths.

---

## Files changed (high level)

- `src/lib/supabase/env.ts` — static `NEXT_PUBLIC_*` reads; `unconfigured` mode; no silent demo
- `src/proxy.ts` — auth-first redirects
- `src/app/login/page.tsx` — customer login entry
- `src/components/layout/{sidebar,app-shell,topbar}.tsx` — no demo/live/sample chrome
- `src/components/live/{mode-gate,configuration-required}.tsx`
- Customer pages wrapped in `ModeGate` (dashboard, buildings, upload, reports, settings, property subpages)
- `src/lib/auth/session.ts`, `src/lib/api/errors.ts` — `configuration_error`
- `.env.example`, tests, this doc

---

## Strict compliance

- [x] Phase 1 only  
- [x] No production deploy / commit / push  
- [x] No secrets printed  
- [x] No DB reset / unapproved migrations  
- [x] No fabricated Vercel success — deployed health still demo/unconfigured  
