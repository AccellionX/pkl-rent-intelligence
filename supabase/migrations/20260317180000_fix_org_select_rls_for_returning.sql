-- Fix org create via PostgREST Prefer: return=representation.
-- RETURNING/SELECT RLS runs before AFTER INSERT membership triggers.
-- A plain NOT EXISTS against organization_members is wrong: that subquery is
-- itself RLS-filtered, so non-members would see every org as "memberless".
-- Use a security-definer helper that bypasses RLS for the emptiness check.

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

drop trigger if exists organizations_add_creator_as_owner on public.organizations;

create trigger organizations_add_creator_as_owner
  after insert on public.organizations
  for each row execute function public.handle_organization_created();

drop policy if exists organizations_select on public.organizations;

create policy organizations_select on public.organizations
  for select to authenticated
  using (
    public.is_org_member(id)
    or not public.org_has_any_member(id)
  );

notify pgrst, 'reload schema';
