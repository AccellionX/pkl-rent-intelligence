-- Task #3: upload / reprocess metadata for Rentometer intake

alter table public.source_documents
  add column if not exists external_report_id text,
  add column if not exists content_sha256 text,
  add column if not exists parser_version text,
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists summary_metrics jsonb not null default '{}'::jsonb,
  add column if not exists superseded_by uuid references public.source_documents (id) on delete set null,
  add column if not exists unit_type_id uuid references public.unit_types (id) on delete set null;

create index if not exists source_documents_external_report_id_idx
  on public.source_documents (external_report_id);

create index if not exists source_documents_content_sha256_idx
  on public.source_documents (content_sha256);

create index if not exists source_documents_superseded_by_idx
  on public.source_documents (superseded_by);

create index if not exists source_documents_unit_type_id_idx
  on public.source_documents (unit_type_id);

-- Candidate review helpers: keep prior decisions durable; new extractions stay pending.
comment on column public.source_documents.external_report_id is
  'Vendor report id when available (e.g. Rentometer qPiKWT24DL0)';
comment on column public.source_documents.summary_metrics is
  'Dataset-level summary stats from PDF/summary sources; not curated approved-comp KPIs';
comment on column public.source_documents.superseded_by is
  'Set when a newer upload replaces this document for reprocessing';
