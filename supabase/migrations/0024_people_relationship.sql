-- Free-text relationship label (e.g. "sister", "girlfriend", "roommate") so
-- the conversational assistant can resolve "my sister's schedule" to a
-- specific tracked Person (0013_people.sql) without a fixed enum -- human
-- relationship vocabulary is open-ended and culture/family-specific.
alter table public.people
  add column relationship text check (relationship is null or char_length(relationship) <= 60);

-- 0013_people.sql's active_people is `select * from public.people` -- in
-- Postgres a `select *` view's column list is fixed at CREATE/REPLACE time,
-- not re-resolved when the underlying table gains a column, so the new
-- `relationship` column would silently never appear through the view
-- without this. CREATE OR REPLACE VIEW keeps the view's OID (and therefore
-- its existing grants/revokes below it) intact, so the prior
-- `revoke insert, update, delete on public.active_people from anon,
-- authenticated` from 0013_people.sql still applies -- no need to reissue it.
create or replace view public.active_people with (security_invoker = on) as
  select * from public.people where deleted_at is null;
