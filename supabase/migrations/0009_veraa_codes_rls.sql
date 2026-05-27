-- 0009_veraa_codes_rls.sql
-- Veraa partner codes are written/read ONLY by the proxy using the Supabase SERVICE ROLE key, which
-- bypasses RLS entirely. The table (created in 0007) already has RLS enabled with no policies, so the
-- app's anon/authenticated key can never touch it — which is exactly what we want for partner codes.
--
-- The proxy's insert failing silently (codes vanishing on reload) was NOT an RLS problem — it was the
-- proxy returning 200 even when the insert errored. That's fixed in proxy.js. This migration just makes
-- the table guaranteed-present and adds an EXPLICIT service-role policy for clarity/safety.
--
-- NOTE: we intentionally scope the policy `to service_role` rather than the unqualified `using (true)`
-- form (which defaults to PUBLIC and would expose partner codes to the anon key). Service role already
-- bypasses RLS, so this policy is belt-and-suspenders and does not widen access to anon/authenticated.

create table if not exists veraa_codes (
  code        text primary key,
  client_name text,
  created_at  timestamptz default now(),
  used_by     text,
  used_at     timestamptz,
  revoked     boolean default false
);

alter table veraa_codes enable row level security;

drop policy if exists "Service role full access" on veraa_codes;
create policy "Service role full access" on veraa_codes
  to service_role
  using (true) with check (true);
