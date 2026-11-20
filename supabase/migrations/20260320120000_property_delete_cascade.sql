-- Allow property deletion to cascade through append-only review_decisions.
-- Normal row DELETE/UPDATE of review_decisions remains blocked; purge is gated by a
-- transaction-local GUC set only inside delete_property_cascade.

create or replace function public.reject_review_decision_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('pkl.allow_review_decision_purge', true) = 'true' then
    return old;
  end if;
  raise exception 'review_decisions are append-only';
end;
$$;

create or replace function public.delete_property_cascade(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.properties
  where id = p_property_id;

  if v_org is null then
    raise exception 'Property not found';
  end if;

  -- Authenticated org members (app DELETE) or service_role (trusted server jobs).
  if not (
    (auth.uid() is not null and public.is_org_member(v_org))
    or coalesce(auth.role(), '') = 'service_role'
  ) then
    raise exception 'Not authorized to delete this property';
  end if;

  -- Transaction-local: allows review_decisions cascade during this delete only.
  perform set_config('pkl.allow_review_decision_purge', 'true', true);

  delete from public.properties where id = p_property_id;
end;
$$;

revoke all on function public.delete_property_cascade(uuid) from public;
grant execute on function public.delete_property_cascade(uuid) to authenticated;
grant execute on function public.delete_property_cascade(uuid) to service_role;

notify pgrst, 'reload schema';
