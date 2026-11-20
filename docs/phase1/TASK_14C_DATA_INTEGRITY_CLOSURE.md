# Task #14C — Final data integrity and interaction closure

**Status:** PARTIAL  
**Date:** 2026-11-18  
**Project:** `mqsvrastpdratvzuouxk`  
**Strict:** No Vercel, no commit/push, no DB reset, no 855 client-comp mutations.  
**Note:** `docs/phase1/TASK_14_LOCAL_FUNCTIONAL_AUDIT.md` was not present in the tree; work continued from 14A/14B docs.

## Migration safety review and status

### Unrelated pending migration

| Version | Local | Remote | Action |
|---------|-------|--------|--------|
| `20260317210000` task09 narrative | yes | **no** | **Left unapplied** (not authorized) |
| `20260318200000` task14b idempotency | yes | **yes (applied)** | Applied via targeted SQL only |

`supabase db push` was **not** used (would have pulled in task09). Applied with:

```text
supabase db query --remote --yes -f supabase/migrations/20260318200000_task14b_idempotency_keys.sql
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260318200000', 'task14b_idempotency_keys');
notify pgrst, 'reload schema';
```

Dry-read beforehand confirmed `api_idempotency_keys` did not exist and remote history ended at `20260317200000`.

### Table guarantees (applied)

- Unique `(organization_id, user_id, route, idempotency_key)`
- `request_fingerprint` for payload binding
- `state`: `pending | completed | failed`
- `expires_at` (24h default)
- RLS: select/insert/update only own keys in membership orgs
- No DELETE policy (failed → pending reset via UPDATE)

## Durable idempotency verification

| Check | Result |
|-------|--------|
| Same key + same payload replay | **PASS** — same property id (`ed45b99f-…`) |
| Same key + different payload | **PASS** — 409 `idempotency_fingerprint_mismatch` |
| Durable rows in DB | **PASS** — `completed` / `failed` rows observed |
| Cross-process memory alone insufficient | Mitigated by durable claim insert + wait |
| Failed claim recovery | Failed → `pending` reset allows same-key retry |
| Tenant isolation | Scoped by org + user in unique key + RLS |

App: `src/lib/api/idempotency.ts` (fingerprint, claim, complete, mismatch).

## Failed-upload lifecycle fixes

| Change | Location |
|--------|----------|
| Shared `markSourceDocumentFailed` + pending-extraction cleanup | `src/lib/uploads/lifecycle.ts` |
| Stale `parsing` → `failed` after 30m | `failStaleParsingDocuments` on upload |
| Rentometer unsupported layout / parse errors mark failed + retryable details | `persist.ts` |
| HelloData / MLS parse exceptions mark failed + user validation errors | `persist-hellodata.ts`, `persist-mls.ts` |
| Upload toast explains audit retention + retry | `upload/page.tsx` |

**Preserved:** failed `source_documents` rows remain for audit (`parse_status=failed`). Storage kept for retry inspection. No deletion of accepted/overridden review decisions.

**Verified:** bad CSV → 400 friendly message, `retryable: true`, document(s) with `parse_status=failed` only.

## Duplicate-property handling

- **Not** global name uniqueness
- Normalized full address match within organization
- `POST /api/properties` → 409 `duplicate_property_address` with match names/addresses
- Client confirm → `confirmDuplicateAddress: true` creates exception
- Idempotency still prevents double-click duplicates
- No automatic merge

Helpers: `src/lib/properties/duplicate-address.ts`  
UI: confirm dialog in `live-buildings.tsx`

## Browser action-by-action results (Dbg Org)

| Action | Method | Result |
|--------|--------|--------|
| Org context Dbg Org | Browser + `/api/me` | Used `522e05ac-…` |
| Durable property create replay | Authenticated API | Same id |
| Fingerprint mismatch | API | 409 |
| Duplicate address warn | API | 409 with matches |
| Failed Rentometer CSV | API | 400 + failed doc |
| Photo upload (1×1 PNG) | API | 201 |
| Property detail UI | Browser | Pointer cursors; 0 UUIDs; photo img present |
| Narrative generate/approve (test report) | API | Approve 200 |
| Draft PDF generate + download | API + browser download click | 2 pages, `PKL-Fourteen-B-Test-Property-draft.pdf` |
| Final PDF without approved comps | API | 400 blocked (comps) — **correct** |
| Comp accept/exclude on 855 | **Not run** | Forbidden by task |
| HelloData/MLS full file UI click | **Not re-run** | Lifecycle code paths updated; prior e2e parsers remain |
| Photo crop/reorder UI | **Partial** | Upload verified; crop modal not click-exercised |
| Synthetic comp accept | **Not created** | Would require fabricating candidates; skipped to avoid false comps |

## Global UX regression (spot-check)

- Pointer on nav/actions: yes  
- Disabled `not-allowed` on inactive controls: yes (prior)  
- No demo/live tags / sample fallback: yes (`mode=live`)  
- No visible UUIDs on audited pages: yes  
- Friendly errors (no PGRST): yes on tested failures  

## Tests

```
npm test          # 32 files / 160 tests passed
npm run typecheck # passed
npm run lint      # passed
npm run build     # passed
```

Added/updated: durable fingerprint tests, duplicate-address unit tests.

## Remaining blockers / gaps

1. **Task #09 narrative migration** (`20260317210000`) still local-only — needs separate authorization.  
2. **Photo crop/reorder UI** and **full HelloData/MLS browser uploads** not end-to-end click-verified this pass.  
3. **Synthetic comparable accept/exclude** not exercised (avoid inventing comps); finalize correctly remains blocked without eligible approved comps.  
4. Failed upload documents retain storage objects by design (audit); no automatic storage GC beyond pre-row orphan cleanup.  
5. Cross-instance durable wait is poll-based (100ms × 40); extreme multi-second stalls return `idempotency_in_progress`.

## Strict compliance

- [x] Applied **only** authorized idempotency migration  
- [x] Did not apply task09 / did not `db push` all  
- [x] No Vercel / no commit / no push / no reset  
- [x] No 855 Providence client comp mutations  
- [x] Live Supabase only (no sample fallback)  
