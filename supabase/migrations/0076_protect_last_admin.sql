-- ============================================================================
-- 1) Καθάρισμα: το migration 0062 μοίραζε τους δοκιμαστικούς λογαριασμούς
--    κυκλικά σε 6 ρόλους (πελάτης, admin, skipper, hostess, cook, deckhand),
--    ώστε να υπάρχει ένας δοκιμαστικός ανά ρόλο για δοκιμές — ό,τι έπεφτε στη
--    "θέση 2" του κύκλου έπαιρνε role='admin'. Αυτό ΔΕΝ είναι ο πραγματικός
--    admin της πλατφόρμας (αυτός έχει is_staff_admin=true πάνω στον κανονικό
--    του λογαριασμό — βλ. 0038), είναι καθαρά δοκιμαστικό υπόλοιπο. Γυρίζει
--    πίσω σε 'client' — ασφαλές, αφού αφορά μόνο is_test_account=true.
-- ============================================================================

update users set role = 'client'
where role = 'admin' and is_test_account = true;

-- Ένας πελάτης χωρίς client_profiles row δείχνει σπασμένος στο UI (πορτοφόλι,
-- αξιοπιστία) — μόνο για όσους μόλις γύρισαν σε client παραπάνω και δεν
-- είχαν ήδη ένα (π.χ. επειδή ήταν παλιότερα client πριν μπουν στον κύκλο).
insert into client_profiles (user_id)
select id from users
where role = 'client' and is_test_account = true
  and id not in (select user_id from client_profiles)
on conflict do nothing;

-- ============================================================================
-- 2) Ποτέ μηδέν admin: ούτε η διαγραφή λογαριασμού ούτε η αφαίρεση
--    δικαιωμάτων admin πρέπει να μπορεί να αδειάσει εντελώς την πλατφόρμα από
--    διαχειριστές. "Admin" εδώ σημαίνει role='admin' Ή is_staff_admin=true —
--    ο πραγματικός, καθημερινός admin της πλατφόρμας είναι δεύτερης μορφής
--    (κανονικός λογαριασμός + is_staff_admin), όχι role='admin'.
-- ============================================================================

-- Το soft_delete_account ήδη εμπόδιζε role='admin' απόλυτα (ποτέ δεν
-- επιτρεπόταν, ανεξαρτήτως πόσοι admin υπάρχουν) — αλλά ο πραγματικός,
-- καθημερινός admin της πλατφόρμας ΔΕΝ έχει role='admin', έχει
-- is_staff_admin=true πάνω στον κανονικό του λογαριασμό (βλ. 0038), οπότε
-- έμενε απροστάτευτος από αυτόν ακριβώς τον έλεγχο. Ίδιος απόλυτος κανόνας,
-- επεκτείνεται να καλύπτει και is_staff_admin — η υπόλοιπη function μένει
-- ίδια με το 0074 (ίδιοι έλεγχοι pending activity, ίδιο admin_actions log).
create or replace function soft_delete_account(p_user_id uuid, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
begin
  select * into v_row from users where id = p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status = 'deleted' then raise exception 'already_deleted'; end if;
  if v_row.role = 'admin' or v_row.is_staff_admin then raise exception 'cannot_delete_admin'; end if;

  if exists (select 1 from booking_requests where client_id = p_user_id and status = 'open') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from delivery_requests dr join delivery_role_requests rr on rr.delivery_request_id = dr.id
             where dr.client_id = p_user_id and rr.status = 'open') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from bookings where client_id = p_user_id and status = 'confirmed') then
    raise exception 'has_pending_activity';
  end if;
  if exists (select 1 from delivery_bookings where client_id = p_user_id and status = 'confirmed') then
    raise exception 'has_pending_activity';
  end if;

  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;
  if v_skipper_id is not null then
    if exists (select 1 from bookings where skipper_id = v_skipper_id and status = 'confirmed') then
      raise exception 'has_pending_activity';
    end if;
    if exists (select 1 from delivery_bookings where skipper_id = v_skipper_id and status = 'confirmed') then
      raise exception 'has_pending_activity';
    end if;
  end if;

  -- Μόνο το status αλλάζει· τηλέφωνο/όνομα/email μένουν ακριβώς όπως ήταν,
  -- ώστε μια μελλοντική επανεγγραφή με το ίδιο νούμερο να ξαναβρεί την ίδια
  -- γραμμή (βλ. complete_registration).
  update users set status = 'deleted' where id = p_user_id;

  if v_skipper_id is not null then
    update skipper_profiles set deleted_at = now() where id = v_skipper_id and deleted_at is null;
    update skipper_secondary_roles set deleted_at = now() where skipper_id = v_skipper_id and deleted_at is null;
  end if;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (coalesce(auth.uid(), p_user_id), 'ban_account', p_user_id,
      coalesce(p_notes, 'Διαγραφή λογαριασμού (αυτοεξυπηρέτηση ή admin).'));
end;
$$;

-- Αφαίρεση δικαιωμάτων admin (p_flag = false) μπλοκάρεται μόνο αν δεν θα
-- έμενε κανένας άλλος admin μετά — δίνοντας δικαιώματα (p_flag = true) δεν
-- έχει κανέναν περιορισμό, όπως και πριν.
create or replace function admin_set_staff_admin(p_user_id uuid, p_flag boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_was_admin boolean;
  v_other_admins int;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select (role = 'admin' or is_staff_admin) into v_was_admin from users where id = p_user_id;
  if v_was_admin is null then raise exception 'user_not_found'; end if;

  if not p_flag and v_was_admin then
    select count(*) into v_other_admins
      from users
      where id <> p_user_id and (role = 'admin' or is_staff_admin);
    if v_other_admins = 0 then
      raise exception 'cannot_remove_last_admin';
    end if;
  end if;

  perform set_config('platform.trusted', 'true', true);
  update users set is_staff_admin = p_flag where id = p_user_id;
end;
$$;
grant execute on function admin_set_staff_admin(uuid, boolean) to authenticated;
