-- Task #15 — Google Drive backup metadata (forward-only).
-- DO NOT apply without explicit authorization.
-- Leaves 20260317210000 (task09 narrative) untouched / unapplied.

-- ---------------------------------------------------------------------------
-- Organization reports root folder (human-readable + id)
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists drive_reports_root_folder_id text,
  add column if not exists drive_reports_root_folder_name text,
  add column if not exists drive_connection_checked_at timestamptz,
  add column if not exists drive_connection_error text;

comment on column public.organizations.drive_reports_root_folder_id is
  'Google Drive folder id used as the org reports root for property folders';
comment on column public.organizations.drive_reports_root_folder_name is
  'Cached human-readable Drive folder name for UI display';

-- ---------------------------------------------------------------------------
-- Property folder display name + last verification
-- ---------------------------------------------------------------------------

alter table public.properties
  add column if not exists drive_folder_name text,
  add column if not exists drive_folder_verified_at timestamptz;

comment on column public.properties.drive_folder_id is
  'Google Drive folder id associated with this property (org-scoped)';
comment on column public.properties.drive_folder_name is
  'Cached human-readable Drive folder name — never show raw ids in UI';

-- ---------------------------------------------------------------------------
-- Report backup audit (status remains on report_runs.status / saved_to_drive_at)
-- ---------------------------------------------------------------------------

alter table public.report_runs
  add column if not exists drive_file_id text,
  add column if not exists drive_web_view_link text,
  add column if not exists drive_backup_error text;

comment on column public.report_runs.drive_file_id is
  'Drive file id of the backed-up finalized PDF (set only after API confirms)';
comment on column public.report_runs.drive_backup_error is
  'Last user-facing backup failure message; cleared on success';

-- ---------------------------------------------------------------------------
-- Snapshot Drive confirmation extras (payload remains immutable)
-- ---------------------------------------------------------------------------

alter table public.report_snapshots
  add column if not exists drive_web_view_link text,
  add column if not exists drive_file_name text,
  add column if not exists drive_md5_checksum text;

-- Allow attaching generated_file_* when previously null, and Drive confirmation fields.
create or replace function public.protect_report_snapshot_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.report_run_id is distinct from old.report_run_id
     or new.organization_id is distinct from old.organization_id
     or new.version is distinct from old.version
     or new.payload is distinct from old.payload
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'report_snapshots payload and identity fields are immutable';
  end if;

  -- generated_file_* may be set once (null → value) but never changed afterward.
  if old.generated_file_bucket is not null
     and new.generated_file_bucket is distinct from old.generated_file_bucket then
    raise exception 'report_snapshots generated_file_bucket is immutable once set';
  end if;
  if old.generated_file_path is not null
     and new.generated_file_path is distinct from old.generated_file_path then
    raise exception 'report_snapshots generated_file_path is immutable once set';
  end if;

  -- drive_* confirmation fields are intentionally mutable for backup/retry.
  return new;
end;
$$;

notify pgrst, 'reload schema';
