-- Pricr migration 0002 — run in the Supabase SQL editor after 0001.
-- RLS restricts WHICH rows a session sees; Postgres still needs table-level privilege grants.
-- We grant only to `authenticated` (anonymous sign-ins are authenticated sessions), so a request
-- with no session (the `anon` role) stays fully blocked — nothing is publicly readable/writable.

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.businesses   to authenticated;
grant select, insert, update, delete on public.brand_configs to authenticated;
grant select, insert, update, delete on public.users        to authenticated;
grant select, insert, update, delete on public.quotes       to authenticated;
