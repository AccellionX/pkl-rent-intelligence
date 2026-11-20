-- PKL Phase 1 foundation schema
-- Organizations, properties, unit types, comps, report runs, provenance, snapshots, photos, weekly metrics
-- Tenant isolation via RLS. Private storage buckets for source files, photos, and generated reports.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.org_member_role as enum ('owner', 'admin', 'member');

create type public.report_run_status as enum (
  'in_progress',
  'waiting_on_review',
  'sent',
  'saved_to_drive'
);

create type public.source_document_type as enum (
  'rentometer_csv',
  'rentometer_xlsx',
  'rentometer_pdf',
  'hellodata_pdf',
  'mls_ri_pdf',
  'mls_ct_pdf',
  'zillow_xlsx',
  'apartments_xlsx',
  'photo',
  'other'
);

create type public.parse_status as enum (
  'uploaded',
  'parsing',
  'parsed',
  'failed',
  'needs_review'
);

create type public.extraction_review_status as enum (
  'pending',
  'accepted',
  'rejected',
  'overridden'
);

create type public.match_tier as enum ('strongest', 'moderate', 'context');

create type public.comp_unit_data_status as enum (
  'pending',
  'approved',
  'rejected',
  'missing'
);

create type public.photo_source as enum (
  'upload',
  'paste',
  'mls',
  'prior_week',
  'placeholder'
);

create type public.subject_unit_status as enum (
  'available',
  'leased',
  'pending',
  'offline'
);

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger (no table dependency)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core tenancy
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_member_role not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_org_id_idx on public.organization_members (organization_id);

-- ---------------------------------------------------------------------------
-- Helper: membership check (security definer for RLS)
-- Must follow organization_members — SQL-language functions validate relations at create.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- True if org has any member row (bypasses RLS; used by organizations_select).
create or replace function public.org_has_any_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org_id
  );
$$;

revoke all on function public.org_has_any_member(uuid) from public;
grant execute on function public.org_has_any_member(uuid) to authenticated;

-- Bootstrap: authenticated creator becomes organization owner.
create or replace function public.handle_organization_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (new.id, auth.uid(), 'owner')
    on conflict (organization_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

-- AFTER INSERT: membership row needs organizations.id to exist (FK).
-- Pair with organizations_select allowing "no members yet" so PostgREST RETURNING works
-- (RETURNING/SELECT RLS runs before AFTER triggers).
create trigger organizations_add_creator_as_owner
  after insert on public.organizations
  for each row execute function public.handle_organization_created();

-- ---------------------------------------------------------------------------
-- Properties & unit types
-- ---------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  marketing_name text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'US',
  latitude double precision,
  longitude double precision,
  year_built integer,
  stories integer,
  unit_count integer,
  amenities text[] not null default '{}',
  external_links jsonb not null default '{}'::jsonb,
  drive_folder_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint properties_state_len check (char_length(state) between 2 and 3)
);

create index properties_organization_id_idx on public.properties (organization_id);
create index properties_city_state_idx on public.properties (city, state);

create table public.unit_types (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  label text not null,
  beds numeric(4, 1) not null,
  baths numeric(4, 1) not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (property_id, label),
  constraint unit_types_beds_nonneg check (beds >= 0),
  constraint unit_types_baths_nonneg check (baths >= 0)
);

create index unit_types_property_id_idx on public.unit_types (property_id);
create index unit_types_organization_id_idx on public.unit_types (organization_id);

create table public.subject_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_type_id uuid not null references public.unit_types (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  unit_number text not null,
  sqft integer,
  asking_rent numeric(12, 2),
  market_rent numeric(12, 2),
  status public.subject_unit_status not null default 'available',
  available_date date,
  floor integer,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (property_id, unit_number),
  constraint subject_units_sqft_positive check (sqft is null or sqft > 0),
  constraint subject_units_rent_nonneg check (asking_rent is null or asking_rent >= 0),
  constraint subject_units_market_rent_nonneg check (market_rent is null or market_rent >= 0)
);

create index subject_units_property_id_idx on public.subject_units (property_id);
create index subject_units_unit_type_id_idx on public.subject_units (unit_type_id);

-- ---------------------------------------------------------------------------
-- Comparables (property-level membership; unit data may be missing per type)
-- ---------------------------------------------------------------------------

create table public.comparable_properties (
  id uuid primary key default gen_random_uuid(),
  subject_property_id uuid not null references public.properties (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text,
  latitude double precision,
  longitude double precision,
  year_built integer,
  stories integer,
  total_units integer,
  distance_miles numeric(8, 3),
  is_active boolean not null default true,
  addition_note text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index comparable_properties_subject_idx
  on public.comparable_properties (subject_property_id);
create index comparable_properties_org_idx
  on public.comparable_properties (organization_id);

create table public.comparable_unit_data (
  id uuid primary key default gen_random_uuid(),
  comparable_property_id uuid not null references public.comparable_properties (id) on delete cascade,
  unit_type_id uuid not null references public.unit_types (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_type text not null default 'manual',
  match_tier public.match_tier,
  rent_min numeric(12, 2),
  rent_max numeric(12, 2),
  sqft_min integer,
  sqft_max integer,
  psf numeric(10, 4),
  days_on_market integer,
  status public.comp_unit_data_status not null default 'pending',
  has_available_data boolean not null default true,
  community_amenities text[] not null default '{}',
  unit_amenities text[] not null default '{}',
  notes text,
  source_document_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (comparable_property_id, unit_type_id, source_type),
  constraint comparable_unit_data_rent_order check (
    rent_min is null or rent_max is null or rent_min <= rent_max
  ),
  constraint comparable_unit_data_sqft_order check (
    sqft_min is null or sqft_max is null or sqft_min <= sqft_max
  )
);

create index comparable_unit_data_unit_type_idx
  on public.comparable_unit_data (unit_type_id);
create index comparable_unit_data_comp_idx
  on public.comparable_unit_data (comparable_property_id);

-- ---------------------------------------------------------------------------
-- Report runs & provenance
-- ---------------------------------------------------------------------------

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_type_id uuid not null references public.unit_types (id) on delete restrict,
  title text not null,
  status public.report_run_status not null default 'in_progress',
  period_start date not null,
  period_end date not null,
  prepared_by text,
  created_by uuid references auth.users (id) on delete set null,
  recommended_rent_low numeric(12, 2),
  recommended_rent_high numeric(12, 2),
  narrative_draft text,
  narrative_approved text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  saved_to_drive_at timestamptz,
  constraint report_runs_period_order check (period_start <= period_end),
  constraint report_runs_rec_order check (
    recommended_rent_low is null
    or recommended_rent_high is null
    or recommended_rent_low <= recommended_rent_high
  )
);

create index report_runs_org_idx on public.report_runs (organization_id);
create index report_runs_property_idx on public.report_runs (property_id);
create index report_runs_unit_type_idx on public.report_runs (unit_type_id);
create index report_runs_status_idx on public.report_runs (status);
create index report_runs_period_idx on public.report_runs (property_id, period_start desc);

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  report_run_id uuid references public.report_runs (id) on delete set null,
  source_type public.source_document_type not null,
  file_format text not null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  byte_size bigint,
  content_type text,
  parse_status public.parse_status not null default 'uploaded',
  parse_error text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (storage_bucket, storage_path)
);

create index source_documents_property_idx on public.source_documents (property_id);
create index source_documents_report_run_idx on public.source_documents (report_run_id);

alter table public.comparable_unit_data
  add constraint comparable_unit_data_source_document_fk
  foreign key (source_document_id) references public.source_documents (id) on delete set null;

create table public.extracted_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_document_id uuid not null references public.source_documents (id) on delete cascade,
  report_run_id uuid references public.report_runs (id) on delete set null,
  field_key text not null,
  raw_value text,
  normalized_value jsonb,
  confidence numeric(5, 4),
  uncertainty_notes text,
  page_ref text,
  row_ref text,
  comparable_property_id uuid references public.comparable_properties (id) on delete set null,
  subject_unit_id uuid references public.subject_units (id) on delete set null,
  review_status public.extraction_review_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint extracted_values_confidence_range check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  )
);

create index extracted_values_document_idx on public.extracted_values (source_document_id);
create index extracted_values_report_run_idx on public.extracted_values (report_run_id);
create index extracted_values_review_idx on public.extracted_values (review_status);

-- Append-only review decisions: future extractions must not silently overwrite these.
create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  extracted_value_id uuid not null references public.extracted_values (id) on delete cascade,
  original_normalized_value jsonb,
  chosen_normalized_value jsonb not null,
  reason text not null,
  reviewer_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create index review_decisions_extracted_idx on public.review_decisions (extracted_value_id);
create index review_decisions_org_idx on public.review_decisions (organization_id);

-- Immutable finalized payloads (payload must not include client prospect PII).
create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  report_run_id uuid not null references public.report_runs (id) on delete cascade,
  version integer not null,
  payload jsonb not null,
  generated_file_bucket text,
  generated_file_path text,
  drive_file_id text,
  drive_confirmed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (report_run_id, version),
  constraint report_snapshots_version_positive check (version > 0)
);

create index report_snapshots_report_run_idx on public.report_snapshots (report_run_id);

create table public.report_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  comparable_property_id uuid references public.comparable_properties (id) on delete set null,
  report_run_id uuid references public.report_runs (id) on delete set null,
  source public.photo_source not null default 'upload',
  storage_bucket text not null,
  storage_path text not null,
  crop_metadata jsonb not null default '{}'::jsonb,
  alt_text text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (storage_bucket, storage_path)
);

create index report_photos_property_idx on public.report_photos (property_id);
create index report_photos_report_run_idx on public.report_photos (report_run_id);

create table public.weekly_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  zillow_metrics jsonb not null default '{}'::jsonb,
  apartments_metrics jsonb not null default '{}'::jsonb,
  tours_scheduled integer not null default 0,
  tours_completed integer not null default 0,
  applications_received integer not null default 0,
  staff_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (property_id, week_start),
  constraint weekly_metrics_week_order check (week_start <= week_end),
  constraint weekly_metrics_counts_nonneg check (
    tours_scheduled >= 0
    and tours_completed >= 0
    and applications_received >= 0
  )
);

create index weekly_metrics_property_week_idx
  on public.weekly_metrics (property_id, week_start desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

create trigger unit_types_set_updated_at
  before update on public.unit_types
  for each row execute function public.set_updated_at();

create trigger subject_units_set_updated_at
  before update on public.subject_units
  for each row execute function public.set_updated_at();

create trigger comparable_properties_set_updated_at
  before update on public.comparable_properties
  for each row execute function public.set_updated_at();

create trigger comparable_unit_data_set_updated_at
  before update on public.comparable_unit_data
  for each row execute function public.set_updated_at();

create trigger report_runs_set_updated_at
  before update on public.report_runs
  for each row execute function public.set_updated_at();

create trigger source_documents_set_updated_at
  before update on public.source_documents
  for each row execute function public.set_updated_at();

create trigger extracted_values_set_updated_at
  before update on public.extracted_values
  for each row execute function public.set_updated_at();

create trigger weekly_metrics_set_updated_at
  before update on public.weekly_metrics
  for each row execute function public.set_updated_at();

-- Protect immutable snapshot payloads (allow only drive confirmation fields).
create or replace function public.protect_report_snapshot_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.report_run_id is distinct from old.report_run_id
     or new.organization_id is distinct from old.organization_id
     or new.version is distinct from old.version
     or new.payload is distinct from old.payload
     or new.generated_file_bucket is distinct from old.generated_file_bucket
     or new.generated_file_path is distinct from old.generated_file_path
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'report_snapshots payload and identity fields are immutable';
  end if;
  return new;
end;
$$;

create trigger report_snapshots_protect_immutability
  before update on public.report_snapshots
  for each row execute function public.protect_report_snapshot_immutability();

-- Review decisions are append-only.
create or replace function public.reject_review_decision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'review_decisions are append-only';
end;
$$;

create trigger review_decisions_no_update
  before update on public.review_decisions
  for each row execute function public.reject_review_decision_mutation();

create trigger review_decisions_no_delete
  before delete on public.review_decisions
  for each row execute function public.reject_review_decision_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.properties enable row level security;
alter table public.unit_types enable row level security;
alter table public.subject_units enable row level security;
alter table public.comparable_properties enable row level security;
alter table public.comparable_unit_data enable row level security;
alter table public.report_runs enable row level security;
alter table public.source_documents enable row level security;
alter table public.extracted_values enable row level security;
alter table public.review_decisions enable row level security;
alter table public.report_snapshots enable row level security;
alter table public.report_photos enable row level security;
alter table public.weekly_metrics enable row level security;

-- Organizations
create policy organizations_select on public.organizations
  for select to authenticated
  using (
    public.is_org_member(id)
    -- PostgREST Prefer:return=representation evaluates RETURNING before AFTER INSERT
    -- triggers; allow the inserting statement to read the row until membership exists.
    -- Must use security-definer helper — a raw NOT EXISTS is RLS-filtered and leaks.
    or not public.org_has_any_member(id)
  );

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (true);

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- Members
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id) or user_id = auth.uid());

create policy organization_members_insert on public.organization_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

create policy organization_members_update on public.organization_members
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Generic org-scoped policies
create policy properties_all on public.properties
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy unit_types_all on public.unit_types
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy subject_units_all on public.subject_units
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy comparable_properties_all on public.comparable_properties
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy comparable_unit_data_all on public.comparable_unit_data
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy report_runs_all on public.report_runs
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy source_documents_all on public.source_documents
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy extracted_values_all on public.extracted_values
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy review_decisions_select on public.review_decisions
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy review_decisions_insert on public.review_decisions
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and reviewer_user_id = auth.uid()
  );

create policy report_snapshots_select on public.report_snapshots
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy report_snapshots_insert on public.report_snapshots
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy report_snapshots_update on public.report_snapshots
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy report_photos_all on public.report_photos
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy weekly_metrics_all on public.weekly_metrics
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Private storage buckets + policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'source-documents',
    'source-documents',
    false,
    52428800,
    array[
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  ),
  (
    'report-photos',
    'report-photos',
    false,
    20971520,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'generated-reports',
    'generated-reports',
    false,
    52428800,
    array['application/pdf']
  )
on conflict (id) do nothing;

-- Object paths are expected as: {organization_id}/...
create or replace function public.storage_org_id(object_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

create policy storage_source_documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'source-documents'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy storage_source_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'source-documents'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy storage_source_documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'source-documents'
    and public.is_org_member(public.storage_org_id(name))
  )
  with check (
    bucket_id = 'source-documents'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy storage_source_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'source-documents'
    and public.is_org_admin(public.storage_org_id(name))
  );

create policy storage_report_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-photos'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy storage_report_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy storage_report_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'report-photos'
    and public.is_org_member(public.storage_org_id(name))
  )
  with check (
    bucket_id = 'report-photos'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy storage_report_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'report-photos'
    and public.is_org_admin(public.storage_org_id(name))
  );

create policy storage_generated_reports_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'generated-reports'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy storage_generated_reports_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'generated-reports'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy storage_generated_reports_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'generated-reports'
    and public.is_org_member(public.storage_org_id(name))
  )
  with check (
    bucket_id = 'generated-reports'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy storage_generated_reports_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'generated-reports'
    and public.is_org_admin(public.storage_org_id(name))
  );
