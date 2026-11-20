# Task #14B — Final action verification and duplicate submission hardening

**Status:** PARTIAL  
**Date:** 2026-11-18  
**Project:** `mqsvrastpdratvzuouxk` (live local)  
**Strict:** No Vercel deploy, no commit/push, no DB reset, no auto-approval of real client comps, migration prepared but **not applied**.

## Summary

Consequential create/finalize routes now accept `Idempotency-Key`, coalesce in-flight duplicates (race-safe), and replay completed responses in-process. Incomplete PDF finalize is blocked with validation errors (not 500). Browser + authenticated API checks used **Dbg Org** test records (`Fourteen B Test Property`), not 855 approved comps.

Durable DB persistence for idempotency keys is prepared as a forward-only migration and awaits separate authorization.

## UX / interaction bugs fixed

| Issue | Fix |
|-------|-----|
| Concurrent double-POST could both insert before memory lock settled | Sync in-flight registration in `runIdempotent` |
| Incomplete/bad PDF finalize could 500 on privacy scan | `assertNoClientProspectPii` throws `validationError` (400) |
| Unsupported Rentometer layout threw raw `Error` → 500 | `validationError` with user-facing copy |
| Create/upload/PDF/narrative/unit/photo lacked idempotency headers | Clients mint `Idempotency-Key` per action |
| PDF finalize could re-render when file already stored | Short-circuit on `generated_file_path` |

## Idempotency protections

### Runtime (active now)

- Library: `src/lib/api/idempotency.ts`
- Header: `Idempotency-Key` (8–128 chars, `[A-Za-z0-9._~-]`)
- Scope: `organizationId + userId + route + key`
- Behavior: process memory TTL 24h + in-flight coalescing
- Wired routes:
  - `POST /api/properties`
  - `POST /api/properties/:id/units`
  - `POST /api/properties/:id/reports`
  - `POST /api/properties/:id/photos`
  - `POST /api/uploads`
  - `POST /api/reports/:id/narrative`
  - `POST /api/reports/:id/pdf/finalize` (+ natural short-circuit if PDF already attached)

### Durable store (prepared, **not applied**)

- Migration: `supabase/migrations/20260318200000_task14b_idempotency_keys.sql`
- Table: `api_idempotency_keys` (tenant RLS)
- App already attempts optional durable read/write; silently falls back until migration is authorized

### Existing DB uniqueness still relied on

- Subject units: `unique (property_id, unit_number)`
- Unit types: `unique (property_id, label)`
- Photos: `unique (storage_bucket, storage_path)`
- Properties: **no** name uniqueness — idempotency key is the primary duplicate guard

## Action-by-action results

| Action | Browser UI | Authenticated API | Pending disable | Duplicate protection | Notes |
|--------|------------|-------------------|-----------------|----------------------|-------|
| Org switch → Dbg Org | Yes | Yes (`/api/me`) | N/A | N/A | Active org label shows name, not UUID |
| Property create (double) | API via browser session | Yes | Client `busy` + pending | Same key → **1 id** (`6d0069b4-…`); 5-way race → **1 id** | Test org only |
| Property edit / Save | Yes — `aria-busy` observed | PATCH 200 | Yes | N/A (PATCH) | Re-enable after settle |
| Unit type + unit create | API | Yes | Client busy | Same key → **1 unit id** | Unit renamed to `A1` (avoid phone-like false positive) |
| Unit delete | Not clicked this pass | API available | Client pending path | Confirm dialog exists | Left test unit in place |
| Photo upload/crop/reorder | Code path + prior 14A | Idempotent POST wired | `busy` gate | Key on upload | Full crop modal not click-tested this pass |
| Bad Rentometer CSV upload | Upload page loaded | Dual POST same key → **400** friendly | Processing gate | Coalesced error | Does not return PGRST/500 |
| HelloData / MLS / XLSX happy-path file | Not re-uploaded | Prior e2e scripts exist | Pending wired | Key on `/api/uploads` | Avoided large re-ingest this pass |
| Comp accept/exclude | Not mutated | — | UI pending from 14A | — | **Intentionally skipped** for 855 real comps; test property has no live candidates |
| Narrative generate (double) | Pricing page loaded | Dual POST → both 200, draft | Button `pending` | Same key coalesced | Live Claude used; **not** approved |
| Narrative approve | Not done | — | Pending wired | — | Left draft so finalize stays blocked |
| PDF readiness / incomplete finalize | Pricing + API | Finalize **400** `Final PDF blocked` with blockers | Finalize disabled when not ready | Snapshot path short-circuit | Blockers: rent range, comps, approved narrative |
| PDF draft download | Button present | Not downloaded this pass | `pending` | Key sent | Avoided large binary in CDP |
| Weekly agent save | Yes — pending observed | POST 200 | Yes | Client single-flight | Test comments only |
| Failed validation recovery | Bad property create | 400 `validation_error` | Controls re-enable | New key on retry | Success toast only after `ok` |
| Visible UUIDs / raw enums / demo | Checked on pages | — | — | — | **0 visible UUIDs**; no demo portfolio labels |

### Incomplete finalize evidence (API)

```
status: 400
code: validation_error
message: Final PDF blocked
blockers:
  - PKL recommended rent range is not set
  - No eligible approved comps for final statistics (do not auto-approve candidates)
  - Approved narrative required for final PDF
```

## Browser verification evidence

- Local `next dev` `:3000`, mode `live`, authenticated as `pkl.task05…@example.com`
- Org: **Dbg Org** (test records)
- Test property: **Fourteen B Test Property** (`6d0069b4-ad21-47af-a1d2-fbc4f37a76e9`)
- CDP + fetch-with-credentials used for concurrent POST proofs; UI clicks for Save property / Save agent notes
- Pages opened: `/buildings`, property detail, `/leads`, `/pricing`, `/upload`, `/settings` (via session)

### Browser-tested vs API-only

| Class | Method |
|-------|--------|
| Org switch, property detail save pending, weekly save pending, upload/pricing page labels | **Browser UI** |
| Property/unit/report create races, finalize blockers, narrative double-generate, bad CSV upload | **Authenticated API in browser context** |
| Photo crop modal, MLS/HelloData full file UX, PDF binary download click, comp accept/exclude | **Not fully UI click-tested** (API/code wired; comps deliberately not approved) |

## Tests & commands

```
npm test          # 31 files / 156 tests passed
npm run typecheck # passed
npm run lint      # passed
npm run build     # passed
```

New/updated tests:

- `tests/unit/idempotency.test.ts` (7) — key parsing, replay, tenant isolation, concurrent race
- Privacy assert still covered by existing calculations-privacy tests

## Remaining blockers / gaps

1. **Durable idempotency migration not applied** — needs explicit authorization + schema reconcile (`task09` narrative migration is also local-only vs remote).  
2. **Failed Rentometer parse still inserts a `source_documents` row** before throwing — duplicate key helps, but orphaned failed docs can accumulate (docCount observed = 2 after bad CSV).  
3. **Photo crop / reorder / MLS-HelloData full UI click-through** not completed in this session.  
4. **Comp accept/exclude** not exercised on purpose (no auto-approval of real 855 comps; test property had no candidates).  
5. **Properties lack DB unique (org, name, address)** — rely on Idempotency-Key + client pending; two different keys can still create near-duplicate names.  
6. **Upload progress bar** can still show staged percentages that are not byte-accurate (pre-existing; not fully removed).

## Strict compliance checklist

- [x] Phase 1 only  
- [x] No Vercel deploy / config changes  
- [x] No commits / pushes  
- [x] No database reset  
- [x] No automatic approval of real client comps  
- [x] Migration prepared, not applied  
- [x] Real Supabase live mode (no sample fallback)  
