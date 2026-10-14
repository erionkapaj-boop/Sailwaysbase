-- ============================================================================
-- Θέσεις μερών (0128): οι διορθώσεις του ιδιοκτήτη πάνω στις συντεταγμένες που
-- βρίσκονται αυτόματα από το OpenStreetMap (lib/platform/countries/gr.coords.js).
--
-- Ο πίνακας κρατά ΜΟΝΟ ό,τι διόρθωσε ο ιδιοκτήτης· η αυτόματη θέση μένει στον
-- κώδικα. Κλειδί: το κλειδί του μέρους («Νησί – Λιμάνι» ή «Μέρος»). Διαβάζεται
-- από όλους (είναι δημόσια γεωγραφία), γράφεται μόνο από διαχειριστή.
-- PostGIS δεν χρειάζεται ακόμα: προστίθεται όταν χρειαστούν ερωτήματα απόστασης
-- μέσα στη βάση (docs/MAP_PLAN.md).
-- ============================================================================

create table if not exists place_positions (
  place_key text primary key check (char_length(btrim(place_key)) between 1 and 200),
  lat double precision not null check (lat between 20 and 60),
  lng double precision not null check (lng between -10 and 45),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
alter table place_positions enable row level security;
revoke all on place_positions from anon, authenticated;

-- Δημόσια ανάγνωση (για να εφαρμόζονται οι διορθώσεις σε όλους).
create or replace function place_positions_public()
returns table (place_key text, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select p.place_key, p.lat, p.lng from place_positions p order by p.place_key;
$$;
revoke execute on function place_positions_public() from public;
grant execute on function place_positions_public() to anon, authenticated;

create or replace function admin_set_place_position(p_key text, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if btrim(coalesce(p_key, '')) = '' or char_length(p_key) > 200 then raise exception 'invalid_value'; end if;
  if p_lat is null or p_lng is null or p_lat not between 20 and 60 or p_lng not between -10 and 45 then raise exception 'invalid_value'; end if;
  insert into place_positions (place_key, lat, lng, updated_by, updated_at)
    values (btrim(p_key), p_lat, p_lng, auth.uid(), now())
    on conflict (place_key) do update set lat = excluded.lat, lng = excluded.lng, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
revoke execute on function admin_set_place_position(text, double precision, double precision) from public, anon;
grant execute on function admin_set_place_position(text, double precision, double precision) to authenticated;

create or replace function admin_reset_place_position(p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  delete from place_positions where place_key = p_key;
end;
$$;
revoke execute on function admin_reset_place_position(text) from public, anon;
grant execute on function admin_reset_place_position(text) to authenticated;
