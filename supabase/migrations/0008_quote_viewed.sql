-- Pricr migration 0008 — run in the Supabase SQL editor.
-- Tracks when a client first opens a signing link (to notify the contractor) and how many times the
-- quote has been viewed. Idempotent (IF NOT EXISTS) — safe to re-run.
alter table quotes add column if not exists first_viewed_at timestamptz;
alter table quotes add column if not exists view_count      integer default 0;
