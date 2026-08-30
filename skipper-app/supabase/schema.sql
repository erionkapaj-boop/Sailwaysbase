-- =========================================================================
-- SKIPPER APP — full database schema (all sections, Phase 1)
-- =========================================================================
-- Autonomous, independent application for professional skippers.
-- Multi-user-ready from day one: every table carries a user_id (or derives
-- it via a parent row) and is protected with row-level security, even
-- though the app currently has a single user. This lets the app open up
-- to other skippers later without a rewrite, and keeps the data layer
-- clean/API-ready for a future sync with SkipperFinder.
--
-- Run this once in the Supabase SQL editor of your project.
-- Requires the pgcrypto extension for gen_random_uuid() (enabled by
-- default on Supabase).
-- =========================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- Helper: keep updated_at current on every UPDATE
-- -------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- 1. PROFILES  (section 8 — Ρυθμίσεις / Προφίλ Skipper)
-- =========================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  photo_url text,
  birth_date date,
  gender text check (gender in ('male', 'female', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create an (empty) profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- =========================================================================
-- 2. PROFESSIONAL CONTACTS  (section 2)
-- =========================================================================

-- Reusable role tags (e.g. "Γραμματεία", "Base Manager", "Λιμεναρχείο").
create table public.contact_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Reusable port/location tags (e.g. "Λευκάδα", "Λαύριο", "Άλιμος").
create table public.contact_ports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  company text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_id_idx on public.contacts (user_id);
create index contacts_company_idx on public.contacts (user_id, company);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- Many-to-many: a contact can have several roles.
create table public.contact_role_links (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  role_id uuid not null references public.contact_roles (id) on delete cascade,
  primary key (contact_id, role_id)
);

-- Many-to-many: a contact can be linked to several ports.
create table public.contact_port_links (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  port_id uuid not null references public.contact_ports (id) on delete cascade,
  primary key (contact_id, port_id)
);

alter table public.contact_roles enable row level security;
alter table public.contact_ports enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_role_links enable row level security;
alter table public.contact_port_links enable row level security;

create policy "contact_roles_all_own" on public.contact_roles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "contact_ports_all_own" on public.contact_ports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "contacts_all_own" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "contact_role_links_all_own" on public.contact_role_links
  for all using (
    exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid())
  );

create policy "contact_port_links_all_own" on public.contact_port_links
  for all using (
    exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = auth.uid())
  );

-- =========================================================================
-- 3. CUSTOMER BRIEFING  (section 3)
-- =========================================================================
-- One default briefing per language today, but the table is left open
-- (no hard 1-per-language constraint) so multiple briefings per language
-- can be added later without a schema change.
create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  language text not null check (language in ('el', 'en')),
  title text,
  content text not null default '',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index briefings_one_default_per_language
  on public.briefings (user_id, language)
  where is_default;

create trigger briefings_set_updated_at
  before update on public.briefings
  for each row execute function public.set_updated_at();

alter table public.briefings enable row level security;

create policy "briefings_all_own" on public.briefings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================================
-- 4. INVENTORY / CHECKLIST  (section 4)
-- =========================================================================
-- The skipper's personal, editable checklist template (not per-vessel).
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index inventory_items_user_id_idx on public.inventory_items (user_id, sort_order);

alter table public.inventory_items enable row level security;

create policy "inventory_items_all_own" on public.inventory_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================================
-- 5 & 6. AVAILABILITY & PRICING  (sections 5a and 6)
-- =========================================================================
create table public.availability_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  is_available boolean not null default true, -- false = explicitly blocked/closed period
  price_per_day numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_period_valid_range check (end_date >= start_date)
);

create index availability_periods_user_id_idx on public.availability_periods (user_id, start_date, end_date);

create trigger availability_periods_set_updated_at
  before update on public.availability_periods
  for each row execute function public.set_updated_at();

alter table public.availability_periods enable row level security;

create policy "availability_periods_all_own" on public.availability_periods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================================
-- 7. CHARTERS — full folder  (sections 5b and 7)
-- =========================================================================
create table public.charters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  vessel_name text,
  company_contact_id uuid references public.contacts (id) on delete set null,
  company_name text, -- free-text fallback until linked to a Contacts entry
  fee numeric(10, 2),
  availability_period_id uuid references public.availability_periods (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint charter_valid_range check (end_date >= start_date)
);

create index charters_user_id_idx on public.charters (user_id, start_date, end_date);

create trigger charters_set_updated_at
  before update on public.charters
  for each row execute function public.set_updated_at();

-- 7a. Vessel check-in — reuses the Inventory check mechanism (section 4),
-- optionally tied to a charter.
create table public.inventory_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  charter_id uuid references public.charters (id) on delete set null,
  vessel_name text,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index inventory_checks_user_id_idx on public.inventory_checks (user_id, started_at desc);
create index inventory_checks_charter_id_idx on public.inventory_checks (charter_id);

create table public.inventory_check_items (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.inventory_checks (id) on delete cascade,
  item_id uuid references public.inventory_items (id) on delete set null,
  item_name text not null, -- snapshot, kept even if the template item is later renamed/deleted
  status text not null check (status in ('present', 'missing')),
  created_at timestamptz not null default now()
);

create index inventory_check_items_check_id_idx on public.inventory_check_items (check_id);

-- 7b. Vessel problem reports during the charter (text + photos).
create table public.charter_problems (
  id uuid primary key default gen_random_uuid(),
  charter_id uuid not null references public.charters (id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now()
);

create index charter_problems_charter_id_idx on public.charter_problems (charter_id);

create table public.charter_problem_photos (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.charter_problems (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index charter_problem_photos_problem_id_idx on public.charter_problem_photos (problem_id);

-- 7c. Customer log — who was on board, plus the skipper's own notes.
create table public.charter_customers (
  id uuid primary key default gen_random_uuid(),
  charter_id uuid not null references public.charters (id) on delete cascade,
  full_name text not null,
  phone text,
  notes text, -- personal impression/review, so the skipper remembers them
  created_at timestamptz not null default now()
);

create index charter_customers_charter_id_idx on public.charter_customers (charter_id);

-- 7d. Experience photos with customers — a separate set from problem photos.
create table public.charter_experience_photos (
  id uuid primary key default gen_random_uuid(),
  charter_id uuid not null references public.charters (id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index charter_experience_photos_charter_id_idx on public.charter_experience_photos (charter_id);

alter table public.charters enable row level security;
alter table public.inventory_checks enable row level security;
alter table public.inventory_check_items enable row level security;
alter table public.charter_problems enable row level security;
alter table public.charter_problem_photos enable row level security;
alter table public.charter_customers enable row level security;
alter table public.charter_experience_photos enable row level security;

create policy "charters_all_own" on public.charters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "inventory_checks_all_own" on public.inventory_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "inventory_check_items_all_own" on public.inventory_check_items
  for all using (
    exists (
      select 1 from public.inventory_checks ic
      where ic.id = check_id and ic.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.inventory_checks ic
      where ic.id = check_id and ic.user_id = auth.uid()
    )
  );

create policy "charter_problems_all_own" on public.charter_problems
  for all using (
    exists (select 1 from public.charters c where c.id = charter_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.charters c where c.id = charter_id and c.user_id = auth.uid())
  );

create policy "charter_problem_photos_all_own" on public.charter_problem_photos
  for all using (
    exists (
      select 1 from public.charter_problems p
      join public.charters c on c.id = p.charter_id
      where p.id = problem_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.charter_problems p
      join public.charters c on c.id = p.charter_id
      where p.id = problem_id and c.user_id = auth.uid()
    )
  );

create policy "charter_customers_all_own" on public.charter_customers
  for all using (
    exists (select 1 from public.charters c where c.id = charter_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.charters c where c.id = charter_id and c.user_id = auth.uid())
  );

create policy "charter_experience_photos_all_own" on public.charter_experience_photos
  for all using (
    exists (select 1 from public.charters c where c.id = charter_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.charters c where c.id = charter_id and c.user_id = auth.uid())
  );

-- =========================================================================
-- STORAGE
-- =========================================================================
-- Create these buckets from the Supabase dashboard (Storage → New bucket):
--   avatars          — public bucket, profile photos (section 8)
--   charter-photos   — private bucket, problem photos + experience photos (section 7)
--
-- Suggested storage policies (adjust bucket names if you rename them).
-- Run after creating the buckets:
--
-- create policy "avatars_public_read" on storage.objects
--   for select using (bucket_id = 'avatars');
-- create policy "avatars_owner_write" on storage.objects
--   for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "avatars_owner_update" on storage.objects
--   for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "avatars_owner_delete" on storage.objects
--   for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
--
-- create policy "charter_photos_owner_all" on storage.objects
--   for all using (bucket_id = 'charter-photos' and (storage.foldername(name))[1] = auth.uid()::text)
--   with check (bucket_id = 'charter-photos' and (storage.foldername(name))[1] = auth.uid()::text);
--
-- Convention: upload paths as "{user_id}/{charter_id}/{filename}" so the
-- (storage.foldername(name))[1] = auth.uid() check above works unmodified.
