-- Pricr migration 0006 — run in the Supabase SQL editor AFTER 0001–0005.
-- Adds the signing audit trail columns to quotes: who signed (ip/user-agent/email) and a
-- structured audit_log of events (quote_viewed, quote_signed) with a tamper-evidence document
-- hash. All statements are idempotent (IF NOT EXISTS), so re-running is safe.

alter table quotes add column if not exists signer_ip         text;
alter table quotes add column if not exists signer_user_agent text;
alter table quotes add column if not exists signer_email       text;
alter table quotes add column if not exists audit_log          jsonb default '[]'::jsonb;

-- Backfill any existing rows so audit_log is never null.
update quotes set audit_log = '[]'::jsonb where audit_log is null;

-- audit_log holds an array of events, e.g.:
-- [
--   { "event": "quote_viewed", "timestamp": "2026-01-01T00:00:00Z", "ip": "1.2.3.4", "user_agent": "Mozilla/5.0..." },
--   { "event": "quote_signed", "timestamp": "2026-01-01T00:00:00Z", "ip": "1.2.3.4", "user_agent": "Mozilla/5.0...",
--     "customer_name": "John Smith", "document_hash": "<sha256_of_quote_data>" }
-- ]
