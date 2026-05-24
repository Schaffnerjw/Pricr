# Pricr — Supabase backend

Persistent cloud backend for Pricr: auth, business profiles, brand config, quotes, and rep accounts.
RLS is enabled on every table — no table is publicly readable/writable.

> The Veraa super-admin override code **CB101919** is **not** stored in Supabase and is unaffected by this setup.

## 1. Create a Supabase project

1. Go to <https://supabase.com> → **New project**. Pick a name, region, and a strong database password.
2. Wait for the project to finish provisioning.

## 2. Run the schema

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste the full contents of [`schema.sql`](./schema.sql) and **Run**.
3. This creates `businesses`, `brand_configs`, `users`, and `quotes`, enables Row Level Security on all four, and adds the "business members only" policies (a user can only read/write rows for the business they belong to).

> `users.id` references `auth.users(id)`, so a Supabase Auth user must exist before its `users` row is inserted (the `useAuth().signUp` flow does this automatically).

## 3. Get your API keys

In the dashboard: **Settings → API**. Copy:
- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **anon / public key** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

(The anon key is safe to ship in the app **because** RLS is enabled. Never put the `service_role` key in the app.)

## 4. Set environment variables

**Local (`~/pricr/.env.local`):**
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
Then restart Metro with cache cleared so `EXPO_PUBLIC_*` values are inlined: `npx expo start --clear`.

**Railway / EAS:** the proxy on Railway does **not** need these (it only talks to Anthropic). For device/production app builds, set the same two `EXPO_PUBLIC_SUPABASE_*` vars in your EAS project env.

## 5. How the app uses it

- `src/lib/supabase.ts` — the client. Exports `default` (the client, or `null` when env is unset) and `isSupabaseConfigured`. **When the keys are absent the app runs entirely on the existing local/demo flows** — nothing breaks.
- `src/hooks/useAuth.ts` — `signIn`, `signUp`, `signOut`, plus `user`/`session`/`loading`.
- `src/hooks/useBusiness.ts` — loads the signed-in user's business + brand config; `save()` writes locally and to Supabase.
- `src/hooks/useQuotes.ts` — `quotes`, `saveQuote`, `updateQuoteStatus`.
- `src/screens/QuotesHistoryScreen.tsx` — Supabase-backed history with status badges and an admin-only status update.

## Status / not yet wired

The client, hooks, schema, and history screen are in place, but the app is **not yet cut over** to Supabase for auth/persistence (it still uses the local code/PIN flow). Finishing the cutover (Steps 6–7) requires a live Supabase project (the keys above) and a decision on the auth model — see the notes in the PR / chat.
