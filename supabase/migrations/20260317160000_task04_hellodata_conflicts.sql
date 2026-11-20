-- Task #4: HelloData enrichment support + source value conflicts

create type public.conflict_status as enum (
  'pending',
  'resolved',
  'ignored'
);

create table public.source_value_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_type_id uuid references public.unit_types (id) on delete set null,
  comparable_property_id uuid references public.comparable_properties (id) on delete set null,
  field_key text not null,
  left_source text not null,
  right_source text not null,
  left_value jsonb not null,
  right_value jsonb not null,
  absolute_delta numeric(12, 2),
  status public.conflict_status not null default 'pending',
  chosen_value jsonb,
  verified_listing_source text,
  verified_at date,
  reviewer_user_id uuid references auth.users (id) on delete set null,
  reviewer_note text,
  left_extracted_value_id uuid references public.extracted_values (id) on delete set null,
  right_extracted_value_id uuid references public.extracted_values (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint source_value_conflicts_field_key_nonempty check (char_length(trim(field_key)) > 0)
);

create index source_value_conflicts_property_idx
  on public.source_value_conflicts (property_id, status);
create index source_value_conflicts_org_idx
  on public.source_value_conflicts (organization_id);

create trigger source_value_conflicts_set_updated_at
  before update on public.source_value_conflicts
  for each row execute function public.set_updated_at();

alter table public.source_value_conflicts enable row level security;

create policy source_value_conflicts_all on public.source_value_conflicts
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Optional aliases for ambiguous address matching
create table public.property_address_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  comparable_property_id uuid references public.comparable_properties (id) on delete cascade,
  alias_normalized text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint property_address_aliases_target check (
    (property_id is not null and comparable_property_id is null)
    or (property_id is null and comparable_property_id is not null)
  )
);

create unique index property_address_aliases_unique_idx
  on public.property_address_aliases (organization_id, alias_normalized);

alter table public.property_address_aliases enable row level security;

create policy property_address_aliases_all on public.property_address_aliases
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
