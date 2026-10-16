-- 0133 — Όριο αιτημάτων ανά λογαριασμό + αίτημα για πολλούς skippers.
--
-- Μέχρι τώρα: 10 αιτήματα / 24 ώρες / χρήστη, σκληρά γραμμένο σε 4 συναρτήσεις
-- (post_open_request, pay_and_broadcast, create_delivery_role_request,
-- create_open_delivery_role_request). Τώρα:
--   · προεπιλογή στο platform_settings (client_request_limit = 10),
--   · προσωπική τιμή ανά λογαριασμό (users.request_limit): κενό = προεπιλογή,
--     -1 = χωρίς όριο, αλλιώς ο αριθμός,
--   · διαχειριστές και ιδιοκτήτης: πάντα χωρίς όριο,
--   · μόνο διαχειριστής αλλάζει την τιμή (admin_set_request_limit).
-- Και post_open_requests: έως 10 ξεχωριστά αιτήματα για την ίδια ημερομηνία
-- σε μία κίνηση, με δέσμευση credits για όλα ή για κανένα.

insert into platform_settings (key, value) values ('client_request_limit', 10)
  on conflict (key) do nothing;

alter table users add column if not exists request_limit int;
alter table users drop constraint if exists users_request_limit_chk;
alter table users add constraint users_request_limit_chk
  check (request_limit is null or request_limit = -1 or request_limit >= 1);

create or replace function guard_users_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_owner_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'client';
    new.status := 'active';
    new.is_test_account := false;
    new.is_staff_admin := false;
    new.is_owner := false;
    new.request_limit := null;
    new.wallet_balance := 0;
    new.phone_verified_at := null;
    new.photo_reviewed_at := null;
    new.deleted_at := null;
    new.deletion_reason := null;
    new.suspension_reason := null;
    new.pin_change_required := false;
    new.signup_bonus_at := null;
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  new.is_test_account := old.is_test_account;
  new.is_staff_admin := old.is_staff_admin;
  new.is_owner := old.is_owner;
  new.request_limit := old.request_limit;
  new.wallet_balance := old.wallet_balance;
  new.phone_number := old.phone_number;
  new.email := old.email;
  new.full_name := old.full_name;
  new.pin_change_required := old.pin_change_required;
  new.signup_bonus_at := old.signup_bonus_at;
  new.photo_reviewed_at := old.photo_reviewed_at;
  new.phone_verified_at := old.phone_verified_at;
  new.deleted_at := old.deleted_at;
  new.deletion_reason := old.deletion_reason;
  new.suspension_reason := old.suspension_reason;
  return new;
end;
$$;

create or replace function request_limit_for(p_uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select case
    when u.role = 'admin' or u.is_staff_admin or u.is_owner or u.request_limit = -1 then 1000000
    else coalesce(u.request_limit, (select value::int from platform_settings where key = 'client_request_limit'), 10)
  end
  from users u where u.id = p_uid;
$$;
revoke execute on function request_limit_for(uuid) from public, anon;
grant execute on function request_limit_for(uuid) to authenticated;

-- Οι τέσσερις συναρτήσεις: το σταθερό «>= 10» γίνεται όριο του λογαριασμού.
-- Ξανατρέχει με ασφάλεια: όπου έχει ήδη γίνει, δεν αλλάζει τίποτα.
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_seen int := 0;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('post_open_request', 'pay_and_broadcast', 'create_delivery_role_request', 'create_open_delivery_role_request')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, '>= 10(\s+then\s+raise exception ''too_many_requests'')', '>= request_limit_for(auth.uid())\1', 'g');
    if v_new = v_def and position('request_limit_for' in v_def) = 0 then
      raise exception 'request limit pattern not found in %', r.oid::regprocedure;
    end if;
    if v_new <> v_def then execute v_new; end if;
    v_seen := v_seen + 1;
  end loop;
  if v_seen <> 4 then raise exception 'expected 4 functions, found %', v_seen; end if;
end $$;

-- Ιδιοκτήτης: ρητά χωρίς όριο.
do $$ begin
  perform set_config('platform.trusted', 'true', true);
  update users set request_limit = -1 where is_owner or phone_number = '+306983427643';
end $$;

create or replace function admin_set_request_limit(p_user_id uuid, p_limit int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on(p_user_id);
  if p_limit is not null and p_limit <> -1 and p_limit < 1 then raise exception 'invalid_limit'; end if;
  if not exists (select 1 from users where id = p_user_id) then raise exception 'user_not_found'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set request_limit = p_limit where id = p_user_id;
end;
$$;
revoke execute on function admin_set_request_limit(uuid, int) from public, anon;
grant execute on function admin_set_request_limit(uuid, int) to authenticated;

-- Αίτημα για πολλούς skippers: p_count ξεχωριστά αιτήματα (1–10), ίδια ημερομηνία.
-- Τα credits δεσμεύονται όλα μαζί· αν δεν φτάνουν, δεν δημιουργείται κανένα.
create or replace function post_open_requests(
  p_start date, p_end date, p_region_id uuid, p_departure_point text, p_arrival_point text,
  p_boat_type_id uuid, p_crew_role crew_role, p_party_size int default null,
  p_private_cabin boolean default null, p_note text default null,
  p_boat_model text default null, p_boat_length_ft int default null, p_boat_year int default null,
  p_cabin_kind text default null, p_count int default 1)
returns setof booking_requests language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_fee numeric;
  v_wallet numeric;
  v_row booking_requests%rowtype;
  i int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_count is null or p_count < 1 or p_count > 10 then raise exception 'invalid_count'; end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || v_uid::text));
  v_fee := (select value from platform_settings where key = 'client_request_fee');
  select wallet_balance into v_wallet from users where id = v_uid for update;
  if v_wallet - user_reserved_credits(v_uid) < v_fee * p_count then raise exception 'insufficient_wallet'; end if;
  for i in 1..p_count loop
    v_row := post_open_request(p_start, p_end, p_region_id, p_departure_point, p_arrival_point,
      p_boat_type_id, p_crew_role, p_party_size, p_private_cabin, p_note,
      p_boat_model, p_boat_length_ft, p_boat_year, p_cabin_kind);
    return next v_row;
  end loop;
  return;
end;
$$;
revoke execute on function post_open_requests(date, date, uuid, text, text, uuid, crew_role, int, boolean, text, text, int, int, text, int) from public, anon;
grant execute on function post_open_requests(date, date, uuid, text, text, uuid, crew_role, int, boolean, text, text, int, int, text, int) to authenticated;
