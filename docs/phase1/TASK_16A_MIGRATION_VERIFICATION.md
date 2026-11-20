# Task #16A — Pending migration application verification

**Date:** 2026-11-18  
**Target project:** `mqsvrastpdratvzuouxk` (PKL Project)  
**Authorization:** Explicit user approval for **only** these two migrations  
**Strict:** No Vercel · no DB reset · no client comparable approvals · no commit/push · no credential exposure

## Result: **PASS**

| Check | Result |
|-------|--------|
| Linked project confirmation | **PASS** — `mqsvrastpdratvzuouxk` |
| Pre-apply history / dry-run | **PASS** — exactly 2 pending |
| SQL safety review | **PASS** — additive, non-destructive |
| Apply | **PASS** — both recorded remotely |
| Data + RLS preservation | **PASS** — counts and 8 policies unchanged |
| Narrative backward compatibility | **PASS** — `narrative_draft` intact; new cols nullable |
| Drive field persistence | **PASS** — org/property/snapshot write/read verified |
| Snapshot immutability | **PASS** — payload blocked; Drive fields mutable |
| npm test / typecheck / lint / build | **PASS** |
| Live Supabase probe + assemble API | **PASS** |

---

## 1. Linked project confirmation

```
supabase projects list → linked:true
project ref: mqsvrastpdratvzuouxk
name: PKL Project
region: ap-southeast-1
status: ACTIVE_HEALTHY
```

`supabase/.temp/project-ref` = `mqsvrastpdratvzuouxk`

---

## 2. Remote migration history (before)

Applied through `20260318200000`. Pending (local only):

| Version | File | Remote before |
|---------|------|---------------|
| `20260317210000` | `task09_narrative_metadata.sql` | absent |
| `20260319200000` | `task15_google_drive.sql` | absent |

No unexpected local migration files beyond the known Phase 1 set (10 total).

---

## 3. SQL reinspection (safety)

### `20260317210000_task09_narrative_metadata.sql`

- `ALTER TABLE … ADD COLUMN IF NOT EXISTS` only on `report_runs`
- Nullable narrative metadata + `narrative_user_edited boolean not null default false`
- Check constraint on `narrative_status` values
- FK to `auth.users` on approve/edit by (`ON DELETE SET NULL`)
- `NOTIFY pgrst, 'reload schema'`
- **No** DROP / DELETE / TRUNCATE / RLS changes

### `20260319200000_task15_google_drive.sql`

- `ADD COLUMN IF NOT EXISTS` on `organizations`, `properties`, `report_runs`, `report_snapshots`
- Replaces `protect_report_snapshot_immutability()` to keep payload/identity immutable while allowing Drive confirmation fields to update
- **No** DROP of existing columns/data; **no** RLS policy changes

Compatibility with already-present columns (`properties.drive_folder_id`, `report_snapshots.drive_file_id`, `drive_confirmed_at`): `IF NOT EXISTS` / additive only.

---

## 4. Dry-run

```bash
supabase db push --linked --include-all --dry-run
```

Would push **exactly**:

1. `20260317210000_task09_narrative_metadata.sql`
2. `20260319200000_task15_google_drive.sql`

No seeds/roles. No unexpected migrations. Proceeded.

---

## 5. Apply

```bash
supabase db push --linked --include-all --yes
```

Output:

```
Applying migration 20260317210000_task09_narrative_metadata.sql...
Applying migration 20260319200000_task15_google_drive.sql...
Finished supabase db push.
```

---

## 6. Post-apply history

`supabase migration list --linked` — both now remote:

| Version | Local | Remote |
|---------|-------|--------|
| `20260317210000` | yes | **yes** |
| `20260319200000` | yes | **yes** |

Subsequent dry-run: no pending migrations (history aligned).

---

## 7. Data + RLS preservation

| Table | Before | After |
|-------|--------|-------|
| organizations | 10 | **10** |
| properties | 13 | **13** |
| report_runs | 11 | **11** |
| report_snapshots | 2 | **2** |
| comparable_properties | 7 | **7** |
| organization_members | 10 | **10** |

RLS policies on `organizations` / `properties` / `report_runs` / `report_snapshots`: **8** before and after (same policy names: org insert/select/update; properties_all; report_runs_all; snapshot insert/select/update).

Existing `narrative_draft` values preserved (`---pkl-narrative-v1---` prefixes still present). New `narrative_status` null on legacy rows; `narrative_user_edited` defaulted to `false`.

---

## 8. Narrative metadata + backward compatibility

Live service-role checks on Dbg Org / Task16 report:

| Check | Result |
|-------|--------|
| Existing drafts readable via PostgREST | PASS |
| Write `narrative_status` / `narrative_sections` / `narrative_model` | PASS |
| `narrative_draft` unchanged during meta write | PASS |
| Restore meta markers after verify | done |

App path remains draft-JSON compatible (workflow still persists `narrative_draft`); first-class columns are available for future dual-write without breaking current reads.

---

## 9. Google Drive fields + folder configuration

| Check | Result |
|-------|--------|
| Org root id/name write + read-back | PASS |
| Property `drive_folder_name` / `drive_folder_verified_at` | PASS |
| Existing `drive_folder_id` preserved | PASS |
| Snapshot Drive link/name/checksum mutable | PASS |
| Snapshot `payload` update still rejected | PASS (`report_snapshots payload and identity fields are immutable`) |
| Test markers cleared after verification | done |

Live API: `/api/drive/status` responds under auth (Drive OAuth still missing — connection remains “not connected”; schema path OK).

---

## 10. Automated + live verification

```
npm test         → 194 passed (35 files)
npm run typecheck → pass
npm run lint      → pass
npm run build     → pass
```

Live:

- `/api/health` → `mode: live`
- `tests/integration/live-supabase-probe.test.ts` → PASS (tables exposed; source-documents private)
- Authenticated `GET /api/reports/{task16}/assemble` → OK with payload + narrative document

---

## 11. Not done (out of scope)

- Vercel deploy
- Commit / push
- Google Drive OAuth live upload (credentials still required)
- Geocoding live (key still required)
- Client comparable approvals

---

## 12. Recommended next action

1. Add Geocoding + Drive credentials to local `.env` (Task #16 remaining blockers).  
2. Configure Dbg Org Drive root + test property folder.  
3. Finalize a controlled test PDF and verify live Drive backup.
