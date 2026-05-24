-- Pricr migration 0001
-- Run this in the Supabase SQL editor AFTER schema.sql.
-- Fixes two problems in the initial schema and prepares for the "DB-only, transparent-auth" cutover:
--   1) RLS infinite recursion: the original "users" policy subqueried "users" itself (error 42P17),
--      which made every table return HTTP 500. Replaced with a SECURITY DEFINER helper.
--   2) The app's Business object (code, admin_pin, owner_name, brand, the AI pricing schema, kit fields,
--      members) has no home in the relational columns. Added businesses.code + businesses.config jsonb.

-- ── 1) App storage ──────────────────────────────────────────────────────────
alter table businesses add column if not exists code text;
alter table businesses add column if not exists config jsonb;
create unique index if not exists businesses_code_key on businesses (code);

-- ── 2) Fix RLS recursion ────────────────────────────────────────────────────
drop policy if exists "business members only" on businesses;
drop policy if exists "business members only" on brand_configs;
drop policy if exists "business members only" on users;
drop policy if exists "business members only" on quotes;

-- SECURITY DEFINER bypasses RLS inside the function, so referencing "users" here does NOT recurse.
create or replace function public.user_business_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select business_id from public.users where id = auth.uid()
$$;

grant execute on function public.user_business_ids() to anon, authenticated;

-- users: a session may only see/create/update its OWN row (no self-subquery → no recursion).
create policy "own user row select" on users for select using (id = auth.uid());
create policy "own user row insert" on users for insert with check (id = auth.uid());
create policy "own user row update" on users for update using (id = auth.uid()) with check (id = auth.uid());

-- businesses / brand_configs / quotes: full access only to members of the business.
create policy "members businesses" on businesses
  for all using (id in (select public.user_business_ids()))
  with check (id in (select public.user_business_ids()));

create policy "members brand_configs" on brand_configs
  for all using (business_id in (select public.user_business_ids()))
  with check (business_id in (select public.user_business_ids()));

create policy "members quotes" on quotes
  for all using (business_id in (select public.user_business_ids()))
  with check (business_id in (select public.user_business_ids()));
