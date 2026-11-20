# Task #9 — Claude Narrative Generation & Report Data Assembly

**Overall status:** **PARTIAL**  
**Date:** 2026-11-17  
**Project:** `mqsvrastpdratvzuouxk`  

Canonical report assembly, narrative edit/approve workflow, immutable snapshots, privacy guards, and live authenticated E2E are implemented. **Live Claude API was not exercised** (`ANTHROPIC_API_KEY` absent) — drafts used the deterministic fallback. Migration `20260317210000` prepared and **not applied**. No deploy / commit / push.

---

## 1. Implementation status

| Area | Result |
|------|--------|
| Canonical server-side assembly | **PASS** |
| Deterministic KPIs only | **PASS** |
| Approved comps only / conflicts excluded | **PASS** |
| Weekly vs cumulative / property-wide scope | **PASS** |
| Claude SDK installed + server service | **PASS** (code) |
| Live Claude request | **Not run** — no API key |
| Deterministic narrative fallback | **PASS** (live e2e) |
| Edit / regenerate-preserve / approve / reject | **PASS** |
| Stale fingerprint detection | **PASS** (unit) |
| Immutable `report_snapshots` | **PASS** (e2e trigger) |
| PII scrub + client payload scan | **PASS** |
| Cross-tenant assemble denied | **PASS** (404) |
| Live Pricing UI wiring | **PASS** (no redesign) |
| Forward migration prepared | **Yes — not applied** |

---

## 2. Files changed

**Core**
- `src/lib/reports/types.ts`
- `src/lib/reports/assemble.ts`
- `src/lib/reports/fingerprint.ts`
- `src/lib/reports/narrative-schema.ts`
- `src/lib/reports/narrative-document.ts`
- `src/lib/reports/sanitize-for-claude.ts`
- `src/lib/reports/validate-ai-figures.ts`
- `src/lib/reports/claude-narrative.ts`
- `src/lib/reports/narrative-workflow.ts`
- `src/lib/reports/index.ts`

**API**
- `src/app/api/reports/[id]/assemble/route.ts`
- `src/app/api/reports/[id]/narrative/route.ts`
- `src/app/api/reports/[id]/narrative/approve/route.ts`
- `src/app/api/reports/[id]/narrative/reject/route.ts`
- `src/app/api/reports/[id]/snapshot/route.ts`

**UI / types / config**
- `src/components/buildings/live-report-narrative.tsx`
- `src/app/buildings/[id]/pricing/page.tsx` (live UUID → live narrative; demo isolated)
- `src/domain/database.types.ts` (`subject_units`, `report_snapshots`)
- `.env.example` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`)
- `package.json` (`@anthropic-ai/sdk`, `task09:e2e`)

**Migration / tests / scripts**
- `supabase/migrations/20260317210000_task09_narrative_metadata.sql` (**not applied**)
- `tests/unit/report-narrative.test.ts`
- `scripts/task09-narrative-live-e2e.mjs`

---

## 3. Canonical report payload structure

`CanonicalReportPayload` (`schemaVersion: 1`) includes:

- `organization`, `report`, `property` (amenities, listing links, photo paths)
- `unitType`, `availableUnits`
- `pricing` — PKL `recommendedRentLow/High` (manual), deterministic `stats`, chart series
- `comparables` — approved included, approved-but-excluded (conflicts/missing type), omitted unreviewed count, methodology strings
- `weekly` — property-wide weeks with Zillow weekly + listing-to-date, Apartments, agent fields
- `quality` — warnings/blockers/provenance
- `narrative` — structured document + stale flag + input fingerprint
- `privacyNote`

Assembly refuses demo seed data (live mode APIs only).

---

## 4. Actual 855 Providence assembled data (live e2e)

Against an existing `855 Providence St` property with Task #8 weekly rows:

| Field | Observed |
|-------|----------|
| Property | 855 Providence St |
| Recommended range set | **2150–2250** (manual PATCH) |
| Weekly weeks | **3** |
| Latest Zillow weekly leads | **10** (matches 11/10 reference) |
| Assembly status | `incomplete` (no eligible approved comps on that property yet) |
| Privacy scan | **pass** |
| Unreviewed omitted | 0 on that property |

Reference weekly figures remain available from Task #8 parsers (6575 / 237 / 10 / 28 to-date). Comp-side averages stay empty until comps are approved on the same property/unit type.

---

## 5. Claude integration status

| Item | Status |
|------|--------|
| `@anthropic-ai/sdk` installed | Yes |
| Server service `generateClaudeNarrative` | Yes |
| Prompt uses sanitized assembly only | Yes |
| Money-figure allow-list validation | Yes |
| `ANTHROPIC_API_KEY` in env | **Absent** |
| Live Claude HTTP call | **Not performed** |
| Fallback model id | `deterministic-fallback-no-api-key` |

Do **not** treat e2e narrative as a live Claude success.

---

## 6. Narrative editing / approval results (`npm run task09:e2e`)

| Step | Result |
|------|--------|
| Generate draft | 200 · deterministic fallback |
| Human edit | 200 |
| Regenerate with `preserveUserEdits` | **preserved** “Human-edited…” |
| Approve | 200 · `narrativeStatus: approved` |
| Snapshot v1 | 201 |
| Snapshot immutability | **pass** (DB trigger) |
| Cross-tenant assemble | 404 |

Narrative JSON is stored in `narrative_draft` behind `---pkl-narrative-v1---` so the workflow works **before** metadata columns are migrated. Approved plain text is copied to `narrative_approved`.

---

## 7. PII / security results

- Claude prompt builder redacts email/phone patterns in free text.
- Assembly runs `assertNoClientProspectPii`.
- E2E privacy regex on assemble payload: **pass**.
- Raw source documents are not attached to prompts (metrics + approved comps only).
- AI cannot PATCH recommended rent columns; regenerate clears prior approval to avoid silent reuse of stale approved text after input changes.
- Snapshots are immutable via existing DB trigger.

---

## 8. Tests

```text
npm test            → 100 passed (21 files)
npm run typecheck   → pass
npm run lint        → pass
npm run build       → pass
npm run task09:e2e  → pass (liveClaude: false)
```

Unit coverage: approved-comp omission, weekly vs cumulative draft text, stale fingerprints, preserve-edits merge, narrative serialize, PII scrub, disallowed money figures, missing API key.

---

## 9. Migration requirements

**Prepared (not applied):** `20260317210000_task09_narrative_metadata.sql`

Adds first-class columns on `report_runs`:
`narrative_status`, `narrative_sections`, `narrative_original_sections`, `narrative_input_fingerprint`, `narrative_model`, timestamps, `narrative_approved_by`, `narrative_edited_by`, `narrative_user_edited`.

App currently persists structured docs in `narrative_draft` JSON marker for forward compatibility. Apply only with separate authorization.

Remote history after Task #8B is current through `20260317200000`; `210000` is local-only.

---

## 10. Remaining blockers

1. Provide `ANTHROPIC_API_KEY` (server-only) and re-run generate to claim live Claude success.
2. Authorize apply of `20260317210000` if first-class narrative columns are desired before Task #10.
3. Approve comps on the 855 property/unit type used for assembly so status can become `ready` with full KPI tables.
4. Optional: backfill/link weekly + comps onto one canonical 855 property to reduce e2e property sprawl.

---

## 11. Recommended Task #10

Branded multi-page PDF renderer consuming `GET /api/reports/[id]/assemble` + approved narrative / `report_snapshots.payload`, without inventing numbers or including prospect PII.

---

## Safety log

| Rule | Honored |
|------|---------|
| Phase 1 only / no PDF render / no public URLs / no scraping | Yes |
| No migration apply without authorization | Yes |
| No deploy / commit / push | Yes |
| No fabricated live Claude success | Yes |
| No demo seed in live assembly | Yes |
