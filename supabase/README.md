# Pricr — Supabase backend

Persistent cloud backend for Pricr: auth, business profiles, brand config, quotes, and rep accounts.
RLS is enabled on every table — no table is publicly readable/writable.

> **Super-admin access:** the master code is **not** stored in Supabase or in the app bundle. Set
> `MASTER_CODE` in **Railway → Variables** (no default — if unset, the `/admin/*` endpoints return
> `503 Admin not configured`). The client sends the entered code to the proxy's `POST /admin/auth`,
> which timing-safe-compares it and returns a short-lived (4h) in-memory Bearer token used for all
> admin calls. **Rotate the code — the old hardcoded `CB101919` is retired and must not be reused.**

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

## 5. Run the migrations

After `schema.sql`, run these in order in the SQL editor (they fix the initial schema and prepare RLS for the transparent-auth cutover):

1. `migrations/0001_fix_rls_and_app_storage.sql` — fixes RLS recursion (SECURITY DEFINER `user_business_ids()`), adds `businesses.code` + `businesses.config` jsonb.
2. `migrations/0002_grant_authenticated.sql` — table grants for the `authenticated` role (the `anon` role stays ungranted, so nothing is public).
3. `migrations/0003_business_insert_bootstrap.sql` — splits the businesses policy so INSERT is open while select/update/delete stay members-only. Without this, creating the first business deadlocks. **Idempotent — safe to re-run; it prints the resulting 4 policies.**
4. `migrations/0004_signature_and_terms.sql` — signature + remote-signing columns on `quotes` (incl. `signing_token`) and `terms_and_conditions` on `businesses`.
5. `migrations/0005_username_login_lookup.sql` — username→business-code lookup RPC for username+password login.
6. `migrations/0006_signing_enterprise.sql` — enterprise signing: audit trail (`audit_log`, `signer_ip`, `signer_user_agent`, `signer_email`), SMS identity verification (`signer_phone`, `phone_verified`, `verification_code`, `verification_expires_at`), tamper-evidence `document_hash`, and per-business signing settings (`notification_email`, `require_sms_verification`). Powers SMS verification, the Certificate of Completion, and the signing-confirmation emails. **Idempotent.**

Also enable **anonymous sign-ins** (Auth → Providers/Settings). The app authenticates every device with an anonymous Supabase session so `auth.uid()` exists for RLS — the contractor never sees a login screen.

## 6. How the app uses it

- `src/lib/supabase.ts` — the client. Exports `default` (the client, or `null` when env is unset) and `isSupabaseConfigured`. **When the keys are absent the app runs entirely on the existing local/demo flows** — nothing breaks. During web static prerender (no `window`) it skips persisted-session storage.
- `src/storage/index.ts` — **the single persistence layer; every screen goes through it.** Now Supabase-backed:
  - `codeToUuid(code)` — deterministic business UUID (cyrb128) so the same code resolves across devices.
  - `ensureSession(code)` — transparent anonymous sign-in + a `users` membership row tying the session to the business (for RLS).
  - businesses → `businesses.config` jsonb (provisioned business-first, then membership); roster → `config.members`; quotes → the `quotes` table (full `SavedQuote` in `quote_data`, app `open/won/lost` mapped to the column `draft/sent/accepted/declined`).
  - `getCurrentUser`/`scanAllData`/`runStartupMigrations` stay local. **`DEMO` and the no-backend case fall back to AsyncStorage**, so demo mode works with no connection.
  - `markQuoteSent(code, id)` — flips a quote to `sent` when the rep taps **Share Quote**.
- `src/screens/QuotesHistoryScreen.tsx` — Supabase-backed pipeline view, wired into the admin dashboard ("Quote Pipeline", admin-only, shown only when Supabase is configured).

## Status

Cut over to Supabase and verified live (provision → read-back → quote draft/sent/accepted/delete → RLS isolation). The local/PIN code flow is unchanged on the surface; persistence now lives in Postgres.

### Known limitations (follow-ups, not blockers)

Both stem from storing the whole business in one members-writable `config` jsonb under DB-only RLS:

- **Any member can read `config.adminPin`.** The admin PIN must be verifiable cross-device, so it lives in the readable config. Hardening needs a SECURITY DEFINER verify function (or a separate column with a role check) so reps can't read it.
- **Any member can overwrite `config`** (e.g. the schema). Per-field/per-role write protection would need column-level policies or an Edge Function.
- **Master cross-tenant analytics** (`scanAllData`) reads only local AsyncStorage — an anonymous session can read just its own business under RLS, so a true cross-tenant aggregate needs the service-role key via an Edge Function.
