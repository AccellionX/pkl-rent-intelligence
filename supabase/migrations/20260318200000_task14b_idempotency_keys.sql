-- Task #14B/#14C — durable idempotency keys for consequential create/finalize APIs.
-- FORWARD-ONLY. Authorized for mqsvrastpdratvzuouxk (apply this file only — do not db push all pending).
--
-- Guarantees:
-- - Tenant + user scoped uniqueness on (organization_id, user_id, route, idempotency_key)
-- - request_fingerprint rejects same key with a different payload (app returns 409)
-- - expires_at supports TTL cleanup; completed rows remain until expired
-- - state: pending | completed | failed for cross-instance claim / recovery
-- - RLS: authenticated users only see/insert their own keys in orgs they belong to

create table if not exists public.api_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  route text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  state text not null default 'pending'
    check (state in ('pending', 'completed', 'failed')),
  status_code integer,
  response_body jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint api_idempotency_keys_key_len check (
    char_length(idempotency_key) between 8 and 128
  ),
  constraint api_idempotency_keys_fp_len check (
    char_length(request_fingerprint) between 8 and 128
  ),
  constraint api_idempotency_keys_unique unique (
    organization_id,
    user_id,
    route,
    idempotency_key
  ),
  constraint api_idempotency_keys_completed_has_body check (
    state <> 'completed'
    or (status_code is not null and response_body is not null)
  )
);

create index if not exists api_idempotency_keys_expires_at_idx
  on public.api_idempotency_keys (expires_at);

create index if not exists api_idempotency_keys_org_created_idx
  on public.api_idempotency_keys (organization_id, created_at desc);

alter table public.api_idempotency_keys enable row level security;

drop policy if exists api_idempotency_keys_select_own on public.api_idempotency_keys;
create policy api_idempotency_keys_select_own
  on public.api_idempotency_keys
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and expires_at > now()
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = api_idempotency_keys.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists api_idempotency_keys_insert_own on public.api_idempotency_keys;
create policy api_idempotency_keys_insert_own
  on public.api_idempotency_keys
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = api_idempotency_keys.organization_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists api_idempotency_keys_update_own on public.api_idempotency_keys;
create policy api_idempotency_keys_update_own
  on public.api_idempotency_keys
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = api_idempotency_keys.organization_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
  );

grant select, insert, update on public.api_idempotency_keys to authenticated;
grant all on public.api_idempotency_keys to service_role;

comment on table public.api_idempotency_keys is
  'Task #14C tenant-scoped Idempotency-Key claims and completed responses.';
