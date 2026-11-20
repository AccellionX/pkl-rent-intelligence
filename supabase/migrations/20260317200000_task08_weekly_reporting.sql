-- Task #8: Weekly reporting agent fields + provenance (forward-only).
-- NOT applied remotely in Task #8 unless explicitly authorized.
-- Existing weekly_metrics jsonb columns already store Zillow/Apartments payloads.
-- This migration makes agent counters nullable (missing ≠ 0) and adds feedback fields.

alter table public.weekly_metrics
  alter column tours_scheduled drop not null,
  alter column tours_scheduled drop default,
  alter column tours_completed drop not null,
  alter column tours_completed drop default,
  alter column applications_received drop not null,
  alter column applications_received drop default;

alter table public.weekly_metrics
  add column if not exists feedback_summary text,
  add column if not exists actions_planned text,
  add column if not exists zillow_document_id uuid references public.source_documents (id) on delete set null,
  add column if not exists apartments_document_id uuid references public.source_documents (id) on delete set null;

comment on column public.weekly_metrics.tours_scheduled is
  'Agent-entered tours scheduled for the week; null means not provided (not zero).';
comment on column public.weekly_metrics.feedback_summary is
  'Editable prospect feedback summary — never overwrite on export re-upload.';
comment on column public.weekly_metrics.actions_planned is
  'Editable actions planned for the following week.';

notify pgrst, 'reload schema';
