-- Pricr migration 0005 — run in the Supabase SQL editor.
-- Enables username+PIN login. Usernames live in businesses.config jsonb: the admin username at
-- config->>'username', and rep usernames inside the config->'members' array. RLS lets a session
-- read only businesses it already belongs to, so login (which happens BEFORE membership) needs a
-- SECURITY DEFINER function to map a username -> its business code.
--
-- Security: this only returns the business CODE for a matching username. The code is already a
-- shareable join key (reps use it to join), so exposing it to an unauthenticated caller who knows
-- a valid username is acceptable. It does allow username enumeration — that tradeoff was accepted.
-- The PIN is never involved here; it is verified app-side against the hashed PIN in the config.

create or replace function public.resolve_business_code(p_username text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select code
  from public.businesses
  where lower(config->>'username') = lower(p_username)
     or exists (
       select 1
       from jsonb_array_elements(coalesce(config->'members', '[]'::jsonb)) m
       where lower(m->>'username') = lower(p_username)
     )
  limit 1;
$$;

grant execute on function public.resolve_business_code(text) to anon, authenticated;
