-- SailForAll: public marketplace of last-minute charter deals — mostly
-- one-way "repositioning" trips, where a charter company needs its boat
-- moved to another base and offers a steep discount for someone to sail it
-- there within a given window.
--
-- No login system: anyone can browse (public_deals view) and anyone can
-- post (create_deal). A poster manages their own listing later through a
-- private link containing the row's edit_token — that token is never
-- exposed through the public view, only returned once at creation time and
-- checked server-side by the update/delete RPCs.
--
-- Run this once in the Supabase SQL editor of your project. Requires the
-- pgcrypto extension for gen_random_uuid() (enabled by default on Supabase).

create extension if not exists pgcrypto;

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'booked', 'expired', 'removed')),
  edit_token uuid not null default gen_random_uuid(),

  company_name text not null,
  contact_phone text,
  contact_email text,

  boat_name text,
  boat_type text,
  capacity_cabins int,
  capacity_berths int,
  photo_url text,

  one_way boolean not null default true,
  departure_port text not null,
  arrival_port text,
  trip_start date not null,
  trip_end date,
  flexible_dates boolean not null default false,

  price numeric,
  original_price numeric,
  currency text not null default 'EUR',

  description text
);

create index if not exists deals_status_trip_start_idx on deals (status, trip_start);

alter table deals enable row level security;
-- Intentionally no RLS policies on the base table: anon/authenticated have
-- no direct access to it at all. All access goes through the view and RPCs
-- below, which are granted explicitly and run with definer privileges.

-- Public read surface — omits edit_token so a listing can never be edited
-- or removed by anyone other than whoever holds the private manage link.
create or replace view public_deals as
  select
    id, created_at, status, company_name, contact_phone, contact_email,
    boat_name, boat_type, capacity_cabins, capacity_berths, photo_url,
    one_way, departure_port, arrival_port, trip_start, trip_end, flexible_dates,
    price, original_price, currency, description
  from deals
  where status = 'active';

grant select on public_deals to anon, authenticated;

create or replace function create_deal(payload jsonb)
returns table (id uuid, edit_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  new_token uuid;
begin
  insert into deals (
    company_name, contact_phone, contact_email,
    boat_name, boat_type, capacity_cabins, capacity_berths, photo_url,
    one_way, departure_port, arrival_port, trip_start, trip_end, flexible_dates,
    price, original_price, currency, description
  ) values (
    payload->>'company_name', payload->>'contact_phone', payload->>'contact_email',
    payload->>'boat_name', payload->>'boat_type',
    nullif(payload->>'capacity_cabins', '')::int, nullif(payload->>'capacity_berths', '')::int,
    payload->>'photo_url',
    coalesce((payload->>'one_way')::boolean, true),
    payload->>'departure_port', payload->>'arrival_port',
    (payload->>'trip_start')::date, nullif(payload->>'trip_end', '')::date,
    coalesce((payload->>'flexible_dates')::boolean, false),
    nullif(payload->>'price', '')::numeric, nullif(payload->>'original_price', '')::numeric,
    coalesce(payload->>'currency', 'EUR'),
    payload->>'description'
  )
  returning deals.id, deals.edit_token into new_id, new_token;

  return query select new_id, new_token;
end;
$$;

grant execute on function create_deal(jsonb) to anon, authenticated;

create or replace function get_deal_for_edit(p_id uuid, p_token uuid)
returns setof deals
language sql
security definer
set search_path = public
as $$
  select * from deals where id = p_id and edit_token = p_token;
$$;

grant execute on function get_deal_for_edit(uuid, uuid) to anon, authenticated;

create or replace function update_deal(p_id uuid, p_token uuid, payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update deals set
    company_name = coalesce(payload->>'company_name', company_name),
    contact_phone = payload->>'contact_phone',
    contact_email = payload->>'contact_email',
    boat_name = payload->>'boat_name',
    boat_type = payload->>'boat_type',
    capacity_cabins = nullif(payload->>'capacity_cabins', '')::int,
    capacity_berths = nullif(payload->>'capacity_berths', '')::int,
    photo_url = coalesce(payload->>'photo_url', photo_url),
    one_way = coalesce((payload->>'one_way')::boolean, one_way),
    departure_port = coalesce(payload->>'departure_port', departure_port),
    arrival_port = payload->>'arrival_port',
    trip_start = coalesce((payload->>'trip_start')::date, trip_start),
    trip_end = nullif(payload->>'trip_end', '')::date,
    flexible_dates = coalesce((payload->>'flexible_dates')::boolean, flexible_dates),
    price = nullif(payload->>'price', '')::numeric,
    original_price = nullif(payload->>'original_price', '')::numeric,
    currency = coalesce(payload->>'currency', currency),
    description = payload->>'description',
    status = coalesce(payload->>'status', status)
  where id = p_id and edit_token = p_token;

  return found;
end;
$$;

grant execute on function update_deal(uuid, uuid, jsonb) to anon, authenticated;

create or replace function delete_deal(p_id uuid, p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update deals set status = 'removed' where id = p_id and edit_token = p_token;
  return found;
end;
$$;

grant execute on function delete_deal(uuid, uuid) to anon, authenticated;

-- Storage: create a public bucket named `deal-photos` from the Supabase
-- dashboard (Storage → New bucket → Public bucket) for boat photos uploaded
-- from the posting form.
