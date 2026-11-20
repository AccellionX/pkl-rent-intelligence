-- Task #5: ensure API roles can see Phase 1 tables and PostgREST reloads schema.
-- Safe to re-run. Does not drop or mutate application data.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

-- Reload PostgREST schema cache so new tables appear under /rest/v1
notify pgrst, 'reload schema';
