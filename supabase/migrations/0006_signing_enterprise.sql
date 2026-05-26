-- Pricr migration 0006 — run in the Supabase SQL editor AFTER 0001–0005.
-- Enterprise signing: full audit trail, SMS identity verification, tamper-evidence document
-- hash, and per-business signing settings. All statements are idempotent (IF NOT EXISTS), so
-- re-running is safe. (Supersedes the earlier draft 0006_signing_audit.sql — this is a superset.)

-- ── Signer identity + audit trail on quotes ─────────────────────────────────────
alter table quotes add column if not exists signer_ip               text;
alter table quotes add column if not exists signer_user_agent       text;
alter table quotes add column if not exists signer_email            text;
alter table quotes add column if not exists signer_phone            text;
alter table quotes add column if not exists phone_verified          boolean default false;
alter table quotes add column if not exists document_hash           text;
alter table quotes add column if not exists audit_log               jsonb default '[]'::jsonb;
alter table quotes add column if not exists verification_code       text;          -- hashed; never plaintext
alter table quotes add column if not exists verification_expires_at timestamptz;

-- Backfill so audit_log is never null.
update quotes set audit_log = '[]'::jsonb where audit_log is null;

-- ── Per-business signing settings on businesses ────────────────────────────────
-- NOTE: the app stores business settings in businesses.config (jsonb); the proxy reads
-- config.notificationEmail / config.requireSmsVerification. These top-level columns exist
-- for direct SQL/reporting and future use. SMS verification defaults to ON.
alter table businesses add column if not exists notification_email      text;
alter table businesses add column if not exists require_sms_verification boolean default true;

-- audit_log holds an array of events, e.g.:
-- [
--   { "event":"quote_viewed",            "timestamp":"…", "ip":"1.2.3.4", "user_agent":"Mozilla/5.0…" },
--   { "event":"verification_requested",  "timestamp":"…", "ip":"1.2.3.4", "phone_last4":"1234" },
--   { "event":"verification_completed",  "timestamp":"…", "ip":"1.2.3.4", "phone_last4":"1234" },
--   { "event":"quote_signed",            "timestamp":"…", "ip":"1.2.3.4", "user_agent":"…",
--     "customer_name":"John Smith", "signer_email":"j@x.com", "document_hash":"<sha256>" }
-- ]
