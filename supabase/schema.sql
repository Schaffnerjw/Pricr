-- Pricr Supabase schema
-- Run this in the Supabase SQL editor (see supabase/README.md).

-- Businesses table
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Brand config table
create table brand_configs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  primary_color text default '#2979FF',
  secondary_color text default '#00E5FF',
  background_color text default '#0A0E1A',
  logo_url text,
  brand_configured boolean default false,
  onboarding_primary text,
  onboarding_secondary text,
  onboarding_background text,
  updated_at timestamptz default now()
);

-- Users table (admins and reps)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  role text check (role in ('admin', 'rep')) default 'rep',
  name text,
  email text,
  created_at timestamptz default now()
);

-- Quotes table
create table quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  created_by uuid references users(id),
  customer_name text,
  customer_phone text,
  quote_data jsonb not null,
  total numeric,
  status text check (status in ('draft', 'sent', 'accepted', 'declined')) default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS on all tables
alter table businesses enable row level security;
alter table brand_configs enable row level security;
alter table users enable row level security;
alter table quotes enable row level security;

-- RLS policies: users can only see their own business data
create policy "business members only" on businesses
  for all using (
    id in (select business_id from users where id = auth.uid())
  );

create policy "business members only" on brand_configs
  for all using (
    business_id in (select business_id from users where id = auth.uid())
  );

create policy "business members only" on users
  for all using (
    business_id in (select business_id from users where id = auth.uid())
  );

create policy "business members only" on quotes
  for all using (
    business_id in (select business_id from users where id = auth.uid())
  );
