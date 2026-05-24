-- Pricr migration 0003 — run in the Supabase SQL editor AFTER 0001 and 0002.
--
-- Fixes the provisioning deadlock that blocks creating the very first business:
--   • users.business_id has a FK to businesses(id), so a membership row cannot be
--     inserted until the business exists.
--   • but the "members businesses" policy's WITH CHECK required membership BEFORE
--     the business could be inserted (id IN user_business_ids()).
-- => neither could go first. (Confirmed live: INSERT on businesses returned
--    "new row violates row-level security policy".)
--
-- Fix: provision business-FIRST. Split the single FOR ALL policy so INSERT is
-- permitted for any authenticated session (WITH CHECK true), while SELECT / UPDATE
-- / DELETE stay members-only. A freshly-inserted business is therefore invisible
-- and uneditable until the caller also inserts their own membership row (next
-- statement), at which point user_business_ids() resolves and normal access opens.
--
-- Safety: a non-member who tries to upsert an EXISTING business takes the ON
-- CONFLICT DO UPDATE branch, which is governed by the members-only UPDATE policy
-- and is silently filtered to 0 rows — so existing businesses can't be overwritten.
-- The anon role still has no grants (migration 0002), so nothing is public.

-- Idempotent: drop every policy this migration manages (old and new names) before
-- recreating, so re-running can never half-apply and leave the table without an
-- INSERT policy (which silently breaks provisioning with error 42501).
drop policy if exists "members businesses"          on businesses;
drop policy if exists "businesses select members"   on businesses;
drop policy if exists "businesses insert bootstrap" on businesses;
drop policy if exists "businesses update members"   on businesses;
drop policy if exists "businesses delete members"   on businesses;

create policy "businesses select members" on businesses
  for select using (id in (select public.user_business_ids()));

create policy "businesses insert bootstrap" on businesses
  for insert with check (true);

create policy "businesses update members" on businesses
  for update using (id in (select public.user_business_ids()))
  with check (id in (select public.user_business_ids()));

create policy "businesses delete members" on businesses
  for delete using (id in (select public.user_business_ids()));

-- Verify: should print exactly 4 rows (select/insert/update/delete) and no error.
select cmd, policyname, with_check
from pg_policies
where schemaname = 'public' and tablename = 'businesses'
order by cmd;
