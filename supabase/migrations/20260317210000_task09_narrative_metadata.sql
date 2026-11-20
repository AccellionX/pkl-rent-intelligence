-- Task #9: Narrative workflow metadata on report_runs (forward-only).
-- NOT applied remotely unless explicitly authorized.
-- Structured narrative currently persists in narrative_draft via ---pkl-narrative-v1--- JSON
-- so the app works before this migration is applied. These columns are first-class storage
-- for Task #10+ once authorized.

alter table public.report_runs
  add column if not exists narrative_status text
    check (
      narrative_status is null
      or narrative_status in ('draft', 'edited', 'approved', 'rejected', 'stale')
    ),
  add column if not exists narrative_sections jsonb,
  add column if not exists narrative_original_sections jsonb,
  add column if not exists narrative_input_fingerprint text,
  add column if not exists narrative_model text,
  add column if not exists narrative_generated_at timestamptz,
  add column if not exists narrative_approved_at timestamptz,
  add column if not exists narrative_approved_by uuid references auth.users (id) on delete set null,
  add column if not exists narrative_edited_by uuid references auth.users (id) on delete set null,
  add column if not exists narrative_user_edited boolean not null default false;

comment on column public.report_runs.narrative_status is
  'Workflow status for Claude/human narrative; independent of report_run_status.';
comment on column public.report_runs.narrative_sections is
  'Structured narrative sections (pricingExplanation, compComparison, …).';
comment on column public.report_runs.narrative_input_fingerprint is
  'SHA-256 of approved assembly inputs used for stale detection.';

notify pgrst, 'reload schema';
