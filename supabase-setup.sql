-- Sailways Base App — Supabase setup
-- Run this once in Supabase: Project → SQL Editor → New query → paste all → Run

-- 1) Key-value table holding all app data (users, boats, tasks, quick-tasks, checklist, rules, reports)
create table if not exists kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Allow the app (using the public anon key) to read/write.
-- NOTE: this app gates access with a personal-code screen inside the UI, not with real
-- Supabase accounts, so there is no per-user database-level restriction here. Anyone who
-- had the (unlisted) project URL and anon key could bypass the app and query the table
-- directly. For a small trusted team this is a reasonable trade-off; tightening this later
-- (real auth + row-level security) is a possible future upgrade, not required to launch.
alter table kv enable row level security;
create policy "public read" on kv for select using (true);
create policy "public write" on kv for insert with check (true);
create policy "public update" on kv for update using (true);
create policy "public delete" on kv for delete using (true);

-- 2) Storage bucket for task photos
insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', true)
on conflict (id) do nothing;

create policy "public photo read" on storage.objects for select using (bucket_id = 'task-photos');
create policy "public photo upload" on storage.objects for insert with check (bucket_id = 'task-photos');
create policy "public photo delete" on storage.objects for delete using (bucket_id = 'task-photos');
