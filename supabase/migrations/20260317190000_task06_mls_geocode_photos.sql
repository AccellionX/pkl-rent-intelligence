-- Task #6: MLS identity, geocode cache, and photo provenance columns.
-- Forward-only. Safe to re-run where noted.

-- ---------------------------------------------------------------------------
-- Comparable MLS identity (property-level)
-- ---------------------------------------------------------------------------

alter table public.comparable_properties
  add column if not exists mls_number text;

create index if not exists comparable_properties_org_mls_idx
  on public.comparable_properties (organization_id, mls_number)
  where mls_number is not null;

comment on column public.comparable_properties.mls_number is
  'External MLS listing id when known (RI or CT). Used for identity matching.';

-- ---------------------------------------------------------------------------
-- Geocode cache (shared, org-agnostic normalized address → coordinates)
-- ---------------------------------------------------------------------------

create table if not exists public.geocode_cache (
  id uuid primary key default gen_random_uuid(),
  address_normalized text not null unique,
  latitude double precision,
  longitude double precision,
  formatted_address text,
  provider text not null default 'google',
  status text not null
    check (status in ('ok', 'failed', 'uncertain', 'skipped_no_key')),
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint geocode_cache_lat_range check (
    latitude is null or (latitude >= -90 and latitude <= 90)
  ),
  constraint geocode_cache_lon_range check (
    longitude is null or (longitude >= -180 and longitude <= 180)
  )
);

create index if not exists geocode_cache_status_idx
  on public.geocode_cache (status);

drop trigger if exists geocode_cache_set_updated_at on public.geocode_cache;
create trigger geocode_cache_set_updated_at
  before update on public.geocode_cache
  for each row execute function public.set_updated_at();

alter table public.geocode_cache enable row level security;

-- Authenticated members may read cache; inserts/updates via service or members.
drop policy if exists geocode_cache_select on public.geocode_cache;
create policy geocode_cache_select on public.geocode_cache
  for select to authenticated
  using (true);

drop policy if exists geocode_cache_insert on public.geocode_cache;
create policy geocode_cache_insert on public.geocode_cache
  for insert to authenticated
  with check (true);

drop policy if exists geocode_cache_update on public.geocode_cache;
create policy geocode_cache_update on public.geocode_cache
  for update to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.geocode_cache to authenticated;
grant select, insert, update, delete on public.geocode_cache to service_role;

-- ---------------------------------------------------------------------------
-- Report photo provenance for MLS / reuse
-- ---------------------------------------------------------------------------

alter table public.report_photos
  add column if not exists source_document_id uuid
    references public.source_documents (id) on delete set null;

alter table public.report_photos
  add column if not exists sort_order integer not null default 0;

alter table public.report_photos
  add column if not exists content_sha256 text;

alter table public.report_photos
  add column if not exists width integer;

alter table public.report_photos
  add column if not exists height integer;

create index if not exists report_photos_document_idx
  on public.report_photos (source_document_id)
  where source_document_id is not null;

create index if not exists report_photos_sha_idx
  on public.report_photos (organization_id, content_sha256)
  where content_sha256 is not null;

notify pgrst, 'reload schema';
