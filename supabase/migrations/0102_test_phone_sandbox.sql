-- ============================================================================
-- Δοκιμαστικά τηλέφωνα (+306980000001 έως +306980000099): ξεχωριστός κόσμος.
--
-- Οι λογαριασμοί σε αυτή τη σειρά έχουν κωδικό που είναι γραμμένος στον κώδικα
-- (Ghost Mode: /api/platform/auth/test-signin, και PIN 123456 για όσους φτιάχνει
-- το «Δημιουργία demo»). Οποιοσδήποτε λοιπόν μπορεί να μπει σε αυτούς ή να
-- φτιάξει καινούργιο — αυτό είναι το νόημά τους. Μέχρι τώρα όμως ζούσαν μαζί με
-- τους πραγματικούς χρήστες:
--   - ένας ξένος έπαιρνε το bonus εγγραφής (ψεύτικα χρήματα) και έστελνε
--     αιτήματα σε πραγματικούς επαγγελματίες — που θα πλήρωναν ΠΡΑΓΜΑΤΙΚΟ τέλος
--     αποδοχής για μια δουλειά που δεν υπάρχει
--   - οι demo επαγγελματίες εμφανίζονταν στην αναζήτηση πραγματικών πελατών,
--     και όποιος έμπαινε σε αυτούς έβλεπε και απαντούσε σε πραγματικά αιτήματα
--   - τίποτα δεν εμπόδιζε έναν τέτοιο λογαριασμό να γίνει admin
--
-- Τώρα:
--   1. Κανένας λογαριασμός στη δοκιμαστική σειρά δεν μπορεί να γίνει admin.
--   2. Δοκιμαστικοί και πραγματικοί λογαριασμοί δεν συναντιούνται ποτέ: η
--      αναζήτηση δείχνει μόνο επαγγελματίες του ίδιου κόσμου, και η βάση
--      αρνείται αίτημα, πρόταση ή κράτηση ανάμεσα στους δύο κόσμους — από
--      όποιον δρόμο κι αν έρθει (και από τον admin).
-- Το Ghost Mode συνεχίζει να δουλεύει όπως πριν, μέσα στον δικό του κόσμο.
-- ============================================================================

create or replace function is_test_phone(p_phone text) returns boolean
language sql immutable as $$
  select coalesce(p_phone ~ '^\+3069800000[0-9]{2}$', false);
$$;

create or replace function in_test_world(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_test_phone(phone_number) from users where id = p_user_id), false);
$$;

revoke execute on function in_test_world(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Ποτέ admin.
-- ---------------------------------------------------------------------------
create or replace function guard_test_phone_admin() returns trigger
language plpgsql as $$
begin
  if is_test_phone(new.phone_number) and (new.role = 'admin' or new.is_staff_admin) then
    raise exception 'test_phone_cannot_be_admin';
  end if;
  return new;
end;
$$;

drop trigger if exists zz_guard_test_phone_admin on users;
create trigger zz_guard_test_phone_admin before insert or update on users
  for each row execute function guard_test_phone_admin();

-- ---------------------------------------------------------------------------
-- 2. Ποτέ ανάμεσα στους δύο κόσμους.
-- ---------------------------------------------------------------------------
create or replace function guard_same_world() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_pro uuid;
begin
  select user_id into v_pro from skipper_profiles where id = new.skipper_id;
  if tg_table_name = 'booking_request_pings' then
    select client_id into v_client from booking_requests where id = new.booking_request_id;
  elsif tg_table_name = 'delivery_role_pings' then
    select dr.client_id into v_client
      from delivery_role_requests rr join delivery_requests dr on dr.id = rr.delivery_request_id
     where rr.id = new.delivery_role_request_id;
  else
    v_client := new.client_id;  -- bookings, delivery_bookings
  end if;

  if v_client is not null and v_pro is not null and in_test_world(v_client) <> in_test_world(v_pro) then
    raise exception 'test_account_mismatch';
  end if;
  return new;
end;
$$;

revoke execute on function guard_same_world() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['booking_request_pings', 'bookings', 'delivery_role_pings', 'delivery_bookings'] loop
    execute format('drop trigger if exists zz_guard_same_world on %I', t);
    execute format('create trigger zz_guard_same_world before insert on %I
                    for each row execute function guard_same_world()', t);
  end loop;
end;
$$;

-- Η αναζήτηση: οι αρχικές συναρτήσεις μένουν ως έχουν (μετονομασμένες,
-- μόνο για εσωτερική χρήση) και η δημόσια έκδοση κρατά μόνο τους
-- επαγγελματίες του κόσμου του καλούντος. Ανώνυμος = πραγματικός κόσμος.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'search_available_skippers_all') then
    alter function search_available_skippers(date, date, uuid, uuid, numeric, text, crew_role, uuid)
      rename to search_available_skippers_all;
  end if;
  if not exists (select 1 from pg_proc where proname = 'search_delivery_candidates_all') then
    alter function search_delivery_candidates(crew_role, date, date)
      rename to search_delivery_candidates_all;
  end if;
end;
$$;

revoke execute on function search_available_skippers_all(date, date, uuid, uuid, numeric, text, crew_role, uuid)
  from public, anon, authenticated;
revoke execute on function search_delivery_candidates_all(crew_role, date, date)
  from public, anon, authenticated;

create or replace function search_available_skippers(
  p_start date, p_end date, p_region_id uuid, p_boat_type_id uuid, p_max_price numeric default null,
  p_gender text default null, p_crew_role crew_role default 'skipper', p_language_id uuid default null)
returns setof skipper_public
language sql stable security definer set search_path = public as $$
  select s.* from search_available_skippers_all(p_start, p_end, p_region_id, p_boat_type_id, p_max_price,
                                                p_gender, p_crew_role, p_language_id) s
   where in_test_world((select user_id from skipper_profiles where id = s.id)) = in_test_world(auth.uid());
$$;

create or replace function search_delivery_candidates(p_crew_role crew_role, p_start date, p_end date)
returns setof skipper_public
language sql stable security definer set search_path = public as $$
  select s.* from search_delivery_candidates_all(p_crew_role, p_start, p_end) s
   where in_test_world((select user_id from skipper_profiles where id = s.id)) = in_test_world(auth.uid());
$$;

grant execute on function search_available_skippers(date, date, uuid, uuid, numeric, text, crew_role, uuid)
  to anon, authenticated;
grant execute on function search_delivery_candidates(crew_role, date, date) to anon, authenticated;
