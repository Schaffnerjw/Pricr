-- Pricr migration 0004 — run in the Supabase SQL editor AFTER 0001–0003.
-- Adds digital-signature + remote-signing columns to quotes and a terms_and_conditions
-- field to businesses. All statements are idempotent (IF NOT EXISTS), so re-running is safe.

-- ── Signature + remote signing on quotes ─────────────────────────────────────
alter table quotes add column if not exists signature_data text;
alter table quotes add column if not exists signed_at      timestamptz;
alter table quotes add column if not exists signing_token  uuid default gen_random_uuid();
alter table quotes add column if not exists customer_name  text;
create unique index if not exists quotes_signing_token_key on quotes (signing_token);

-- ── Terms & conditions on businesses ─────────────────────────────────────────
alter table businesses add column if not exists terms_and_conditions text;
