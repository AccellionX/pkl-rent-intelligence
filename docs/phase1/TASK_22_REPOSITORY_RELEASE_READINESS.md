# Task #22 — Repository security and release preparation

**Date:** 2026-11-19  
**Repo:** `AccellionX/pkl-rent-intelligence`  
**Branch:** `main`  
**Remotes:** `origin` → `git@github.com:AccellionX/pkl-rent-intelligence.git`  
**Commits on origin (pre-Phase 1 bulk):** 3 (`Launch…`, Tailwind fix, `db and api`)  
**This task:** prepare secure, reproducible Phase 1 codebase for **private** GitHub backup. **No commit. No push. No Vercel. No history rewrite.**

---

## Gate summary

| Gate | Verdict |
|------|---------|
| Repository security | **FAIL** until remote is made **private** (currently **PUBLIC**) |
| Secret audit | **PASS** (working tree remediated; history notes below) |
| Client data exclusion | **PASS** for proposed next commit (with listed index action) |
| Gitignore | **PASS** |
| Environment template | **PASS** |
| Reproducibility | **PASS** |
| Automated tests | **PASS** (see suite) |
| Safe-to-commit | **CONDITIONAL PASS** — after you authorize; exclude secrets/`tmp` |
| Safe-to-push | **FAIL** until repository visibility is **private** |

---

## 1. Secret and privacy audit

### Method

- Scanned tracked files, untracked working tree, and all commits (`git rev-list --all` + pattern grep).  
- Patterns: JWT-like `eyJ…`, `sk-ant-`, `AIza…`, `sbp_`, `GOCSPX-`, `ya29.`, Postgres URIs with passwords, hardcoded staff passwords.  
- **No secret values are printed in this report.**

### Findings

| Item | Location | Severity | Remediation |
|------|----------|----------|-------------|
| GitHub remote visibility **PUBLIC** | `gh repo view` → `visibility: PUBLIC` | **Critical** | Make the repository **private** before any Phase 1 push |
| Hardcoded staff test password in local e2e scripts | `scripts/task18*.mjs`, `task20*.mjs`, … (pre-fix) | High | **Remediated:** scripts now require `PKL_E2E_EMAIL` / `PKL_E2E_PASSWORD` |
| Hardcoded absolute home-directory client paths | scripts + optional real-PDF unit tests | Medium | **Remediated:** `PKL_CLIENT_SOURCE_DIR` / per-file env overrides |
| Absolute home paths in Phase 1 docs | several `docs/phase1/*.md` | Low | **Remediated:** scrubbed to `<LOCAL_CLIENT_SOURCE_DIR>` / `<REPO_ROOT>` |
| `.env` with live credentials | local disk only | OK | Already gitignored via `.env*` |
| `supabase/.temp/*` (pooler URL / project ref) | local CLI cache | Medium if committed | **Remediated:** gitignored |
| `tmp/` browser evidence (113MB+), screenshots | local only | High if committed | **Remediated:** gitignored |
| `references/30-veterans-pricing-report.docx` | **already on `origin/main`** | Medium (client sample report) | Keep local; **stop tracking** in next commit; rely on **private** repo (no history rewrite authorized) |
| `package-lock.json` `eyJ` hits in history | integrity hashes | None | False positive |
| Committed `.env.example` in history | placeholders only | None | Safe |

### Git history secrets

No Anthropic keys, Supabase service-role JWTs, Google OAuth secrets, Drive refresh tokens, or database passwords were found as committed literals in history.  
**Caveat:** `references/30-veterans-pricing-report.docx` and demo seed `src/data/veterans.ts` already exist on the **public** remote — treat as exposed sample content until the repo is private.

### Test account password

Staff QA password is no longer embedded in scripts. Configure locally:

- `PKL_E2E_EMAIL` / `PKL_E2E_PASSWORD`  
- Optional tenant B: `PKL_E2E_TENANT_B_PASSWORD`  

Rotate the staff test password in Supabase Auth if this value was ever shared outside the engineering machine.

---

## 2. Gitignore audit

Updated `.gitignore` to exclude:

- `.env` / `.env.*` (keeps `.env.example`)  
- OAuth / service-account JSON dumps  
- `supabase/.temp/`  
- `tmp/` evidence and screenshots  
- DB dumps, build outputs, caches, editor junk  
- `/references/**` client packages (preserves `references/.gitkeep`)  
- Root-level PDF/DOCX/XLSX/CSV (allows `tests/fixtures/**` and `public/samples/**`)

**Preserved:** synthetic fixtures under `tests/fixtures/` (Rentometer CSV/XLSX, MLS/HelloData text snippets).  
**Not deleted:** local `tmp/`, Downloads client packages, or `references/*.docx` on disk.

---

## 3. Environment template

`.env.example` documents:

- Required vs optional  
- Browser-safe (`NEXT_PUBLIC_*`) vs server-only  
- Development vs production expectations  
- External ownership (Supabase project, Anthropic org key, GCP billing, PKL Google account for Drive)  
- Local e2e-only variables (never commit values)

---

## 4. Repository hygiene

| Check | Result |
|-------|--------|
| Branch | `main` tracking `origin/main` |
| Lockfile | `package-lock.json` present |
| Migrations | 10 SQL files under `supabase/migrations/` (foundation → Drive) |
| Application source | Phase 1 live UI + APIs present (large untracked/modified set vs origin) |
| Unnecessary artifacts | `tmp/` ignored; not proposed for commit |
| Docs | Phase 1 reports retained; absolute home paths scrubbed |
| Demo vs live | Live ModeGate; demo only with explicit `PKL_ALLOW_DEMO_MODE` |

---

## 5. Handover documentation

| Doc | Role |
|-----|------|
| `README.md` | Setup, architecture, env, migrations, Claude, Drive, Geocoding, deploy checklist, verified vs outstanding |
| `.env.example` | Variable catalog |
| `AGENTS.md` | Agent / content / Supabase CLI rules |
| `docs/phase1/TASK_22_…` | This readiness report |
| Prior `docs/phase1/TASK_*` | Engineering evidence (local acceptance) |

---

## 6. Final verification (this machine)

```
npm test       → 217 passed + 3 skipped (220) across 45 files
npm run typecheck → pass
npm run lint   → pass (0 errors)
npm run build  → pass
```

Live Supabase probe tests use a 20s timeout (network variance). Confirm again immediately before your authorized commit.

---

## 7. Proposed commit (DO NOT RUN until authorized)

### Recommended message

```
feat: complete PKL Phase 1 local implementation and acceptance testing
```

### Should include

- Application source (`src/**`), migrations, tests, `package.json` / `package-lock.json`  
- `scripts/**` (env-gated credentials; no hardcoded secrets)  
- `docs/phase1/**` task reports + this file  
- Updated `README.md`, `.env.example`, `.gitignore`, `AGENTS.md`  
- Synthetic `tests/fixtures/**`, `public/samples/**`  
- `references/.gitkeep`

### Must NOT include

- `.env` / `.env.local`  
- `tmp/**`  
- `supabase/.temp/**`  
- `node_modules/**`, `.next/**`  
- Real client PDFs/XLSX/photos from Downloads  
- OAuth token files / credential JSON dumps  

### Index cleanup to include in the same commit

```bash
git rm --cached references/30-veterans-pricing-report.docx
# file remains on disk; gitignore prevents re-adding
```

### Suggested staging approach (when you authorize)

```bash
# after visibility is private (required before push)
git add -A
git reset -- tmp .env .env.* supabase/.temp
git status   # review carefully
git commit -m "$(cat <<'EOF'
feat: complete PKL Phase 1 local implementation and acceptance testing

EOF
)"
# push only after private + explicit authorization
```

---

## 8. Remaining action required from you

1. **Make `AccellionX/pkl-rent-intelligence` private** on GitHub (blocks safe push today).  
2. Confirm whether `references/30-veterans-pricing-report.docx` should stay local-only (recommended) via `git rm --cached` in the authorized commit.  
3. Optionally **rotate** staff QA password and any keys that lived only in local `.env` if shared.  
4. Explicitly authorize **commit**, then separately authorize **push**.  
5. Do **not** authorize Vercel/production deploy in this task.

---

## Verdict line

**Repository is ready for a private backup commit after visibility is set to private and you authorize the commit.**  
**Not safe to push while the GitHub repository remains public.**
