-- ============================================================================
-- Μοντέλο ρόλων, βήμα 1 από 5 (εντολή ιδιοκτήτη 17/10/2026). Καμία οθόνη δεν αλλάζει.
--
-- Αρχή: ένας χρήστης = ένας λογαριασμός (μία σύνδεση Google) με ΠΟΛΛΟΥΣ ρόλους. Ο χρήστης αλλάζει ρόλο χωρίς νέο
-- login. Στο UI λέμε πάντα «ρόλος», ποτέ «λογαριασμός».
--
-- Ρόλοι (κλειδιά):
--   client        Πελάτης (κάθε χρήστης τον έχει αυτόματα, πάντα ενεργός)
--   professional  Επαγγελματίας πληρώματος (Skipper, Hostess, Cook, Deckhand)
--   company       Εταιρεία / Ιδιοκτήτης σκαφών
--   creator       Δημιουργός εμπειριών
--   team          Ομάδα Skipper Finder (εσωτερικός)
--   admin         Administrator (εσωτερικός)
-- Κατάσταση κάθε ρόλου: active (ενεργός) / pending (σε έλεγχο) / rejected (απορρίφθηκε).
-- Τρέχων ρόλος: users.active_role, αποθηκευμένος, ώστε να μένει μετά από ανανέωση και νέα σύνδεση.
--
-- ΠΗΓΗ ΑΛΗΘΕΙΑΣ ΑΝΑ ΡΟΛΟ (δεν φτιάχνεται δεύτερο σύστημα εγκρίσεων):
--   client        αυτόματα, για κάθε χρήστη
--   professional  το ΥΠΑΡΧΟΝ σύστημα εγκρίσεων: skipper_profiles.approval_status και skipper_secondary_roles.approval_status
--                 (οι υπάρχουσες συναρτήσεις έγκρισης δεν αλλάζουν)· ο πίνακας user_roles ακολουθεί με triggers
--   team          users.is_staff_admin
--   admin         users.role = 'admin' ή users.is_owner
--   company,
--   creator       μόνο εδώ: ο χρήστης αιτείται (request_role → pending), η διαχείριση αποφασίζει (admin_decide_role)
--
-- Τίποτα από όσα δουλεύουν σήμερα δεν αλλάζει: οι έλεγχοι που διαβάζουν users.role / is_admin() μένουν ως έχουν.
-- Η ελεύθερη πρόσβαση χωρίς σύνδεση (accessPolicy) δεν αγγίζεται.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Πίνακας ρόλων και τρέχων ρόλος
-- ---------------------------------------------------------------------------
create table if not exists user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('client', 'professional', 'company', 'creator', 'team', 'admin')),
  status text not null default 'pending' check (status in ('active', 'pending', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_by uuid references users(id) on delete set null,
  decided_at timestamptz,
  primary key (user_id, role)
);
create index if not exists user_roles_role_status on user_roles (role, status);
alter table user_roles enable row level security;
revoke all on user_roles from anon, authenticated;
grant select on user_roles to authenticated;

drop policy if exists "user roles own or admin read" on user_roles;
create policy "user roles own or admin read" on user_roles for select using (user_id = auth.uid() or is_admin());

alter table users add column if not exists active_role text not null default 'client'
  check (active_role in ('client', 'professional', 'company', 'creator', 'team', 'admin'));

-- Ο τρέχων ρόλος αλλάζει ΜΟΝΟ από τις συναρτήσεις της πλατφόρμας (set_active_role, και επαναφορά σε Πελάτη όταν χαθεί ο ρόλος).
create or replace function guard_users_active_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.active_role := 'client';
  else
    new.active_role := old.active_role;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_users_active_role on users;
create trigger trg_guard_users_active_role before insert or update of active_role on users
  for each row execute function guard_users_active_role();

-- ---------------------------------------------------------------------------
-- 2. Συγχρονισμός από τις υπάρχουσες πηγές (εσωτερικά, δεν καλούνται από τον browser)
-- ---------------------------------------------------------------------------
create or replace function set_user_role_state(p_user uuid, p_role text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('platform.trusted', 'true', true);
  if p_status is null then
    delete from user_roles where user_id = p_user and role = p_role;
  else
    insert into user_roles (user_id, role, status) values (p_user, p_role, p_status)
      on conflict (user_id, role) do update
        set status = excluded.status, updated_at = now()
        where user_roles.status is distinct from excluded.status;
  end if;
end;
$$;
revoke execute on function set_user_role_state(uuid, text, text) from public, anon, authenticated;

-- Επαγγελματίας: από το υπάρχον σύστημα εγκρίσεων (κύριο προφίλ και δεύτεροι ρόλοι). active > pending > rejected.
create or replace function sync_professional_role(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select case
           when bool_or(s = 'approved') then 'active'
           when bool_or(s = 'pending') then 'pending'
           when bool_or(s = 'rejected') then 'rejected'
         end
    into v_status
    from (
      select sp.approval_status::text as s from skipper_profiles sp where sp.user_id = p_user and sp.deleted_at is null
      union all
      select sr.approval_status::text from skipper_secondary_roles sr
        join skipper_profiles sp on sp.id = sr.skipper_id
       where sp.user_id = p_user and sp.deleted_at is null and sr.deleted_at is null
    ) x;
  perform set_user_role_state(p_user, 'professional', v_status);
end;
$$;
revoke execute on function sync_professional_role(uuid) from public, anon, authenticated;

-- Εσωτερικοί ρόλοι: από τις σημαίες του χρήστη.
create or replace function sync_staff_roles(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_row users%rowtype;
begin
  select * into v_row from users where id = p_user;
  if not found then return; end if;
  perform set_user_role_state(p_user, 'team', case when coalesce(v_row.is_staff_admin, false) then 'active' end);
  perform set_user_role_state(p_user, 'admin', case when v_row.role = 'admin' or coalesce(v_row.is_owner, false) then 'active' end);
end;
$$;
revoke execute on function sync_staff_roles(uuid) from public, anon, authenticated;

-- Όλοι οι αυτόματοι ρόλοι ενός χρήστη (Πελάτης + Επαγγελματίας + εσωτερικοί). Ασφαλές να τρέξει ξανά.
create or replace function refresh_user_roles(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_user_role_state(p_user, 'client', 'active');
  perform sync_professional_role(p_user);
  perform sync_staff_roles(p_user);
end;
$$;
revoke execute on function refresh_user_roles(uuid) from public, anon, authenticated;

-- Αν ο τρέχων ρόλος παύσει να είναι ενεργός (διαγραφή ή απόρριψη), ο χρήστης επιστρέφει σε Πελάτη.
create or replace function user_roles_reset_active() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.status <> 'active') then
    perform set_config('platform.trusted', 'true', true);
    update users set active_role = 'client' where id = old.user_id and active_role = old.role and old.role <> 'client';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_user_roles_reset_active on user_roles;
create trigger trg_user_roles_reset_active after update or delete on user_roles
  for each row execute function user_roles_reset_active();

-- Triggers πηγών.
create or replace function trg_users_sync_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform refresh_user_roles(new.id);
  elsif new.role is distinct from old.role or new.is_staff_admin is distinct from old.is_staff_admin or new.is_owner is distinct from old.is_owner then
    perform sync_staff_roles(new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_users_sync_roles on users;
create trigger trg_users_sync_roles after insert or update of role, is_staff_admin, is_owner on users
  for each row execute function trg_users_sync_roles();

create or replace function trg_skipper_profile_sync_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform sync_professional_role(old.user_id);
  else
    perform sync_professional_role(new.user_id);
    if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then perform sync_professional_role(old.user_id); end if;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_skipper_profile_sync_role on skipper_profiles;
create trigger trg_skipper_profile_sync_role after insert or delete or update of approval_status, deleted_at, user_id on skipper_profiles
  for each row execute function trg_skipper_profile_sync_role();

create or replace function trg_secondary_role_sync_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select user_id into v_user from skipper_profiles where id = coalesce(new.skipper_id, old.skipper_id);
  if v_user is not null then perform sync_professional_role(v_user); end if;
  return null;
end;
$$;
drop trigger if exists trg_secondary_role_sync_role on skipper_secondary_roles;
create trigger trg_secondary_role_sync_role after insert or delete or update of approval_status, deleted_at on skipper_secondary_roles
  for each row execute function trg_secondary_role_sync_role();

-- ---------------------------------------------------------------------------
-- 3. Μετάπτωση των υπαρχόντων χρηστών
-- ---------------------------------------------------------------------------
-- Πελάτης για όλους· Επαγγελματίας από τα σημερινά προφίλ/εγκρίσεις· Administrator από role = 'admin' / is_owner·
-- Ομάδα από is_staff_admin. Εταιρείες και Δημιουργοί δεν υπάρχουν στα σημερινά δεδομένα (δεν υπάρχει πίνακας γι' αυτούς),
-- άρα δεν μεταφέρεται κανείς. Ασφαλές να ξανατρέξει.
create or replace function backfill_user_roles() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
begin
  for r in select id from users loop
    perform refresh_user_roles(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function backfill_user_roles() from public, anon, authenticated;
select backfill_user_roles();

-- ---------------------------------------------------------------------------
-- 4. Συναρτήσεις για την εφαρμογή
-- ---------------------------------------------------------------------------
create or replace function user_has_active_role(p_user uuid, p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = p_user and role = p_role and status = 'active');
$$;
revoke execute on function user_has_active_role(uuid, text) from public, anon, authenticated;

create or replace function user_roles_json(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active_role', (select u.active_role from users u where u.id = p_user),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('role', ur.role, 'status', ur.status)
             order by array_position(array['client', 'professional', 'company', 'creator', 'team', 'admin'], ur.role))
        from user_roles ur where ur.user_id = p_user), '[]'::jsonb)
  );
$$;
revoke execute on function user_roles_json(uuid) from public, anon, authenticated;

-- Οι ρόλοι του συνδεδεμένου χρήστη και ο τρέχων.
create or replace function get_my_roles()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return user_roles_json(auth.uid());
end;
$$;
revoke execute on function get_my_roles() from public, anon;
grant execute on function get_my_roles() to authenticated;

-- Αλλαγή τρέχοντος ρόλου, χωρίς νέο login: μόνο σε ρόλο που ο χρήστης έχει ΕΝΕΡΓΟ.
create or replace function set_active_role(p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not user_has_active_role(auth.uid(), p_role) then raise exception 'role_not_active'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set active_role = p_role where id = auth.uid();
  return user_roles_json(auth.uid());
end;
$$;
revoke execute on function set_active_role(text) from public, anon;
grant execute on function set_active_role(text) to authenticated;

-- Αίτηση για ρόλο που δεν έχει άλλο σύστημα εγκρίσεων (Εταιρεία, Δημιουργός): γίνεται «σε έλεγχο». Ο Επαγγελματίας ζητείται
-- με το υπάρχον προφίλ επαγγελματία· Ομάδα και Administrator ορίζονται μόνο εσωτερικά.
create or replace function request_role(p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_role not in ('company', 'creator') then raise exception 'role_not_requestable'; end if;
  select status into v_status from user_roles where user_id = auth.uid() and role = p_role;
  if v_status is null or v_status = 'rejected' then
    perform set_user_role_state(auth.uid(), p_role, 'pending');
  end if;
  return user_roles_json(auth.uid());
end;
$$;
revoke execute on function request_role(text) from public, anon;
grant execute on function request_role(text) to authenticated;

-- Απόφαση διαχείρισης για Εταιρεία / Δημιουργό. Ο Επαγγελματίας εγκρίνεται από το υπάρχον σύστημα εγκρίσεων.
create or replace function admin_decide_role(p_user_id uuid, p_role text, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_role not in ('company', 'creator') then raise exception 'role_not_decidable'; end if;
  if p_status not in ('active', 'rejected') then raise exception 'invalid_status'; end if;
  perform assert_admin_can_act_on(p_user_id);
  if not exists (select 1 from user_roles where user_id = p_user_id and role = p_role) then raise exception 'role_not_found'; end if;
  perform set_config('platform.trusted', 'true', true);
  update user_roles set status = p_status, decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where user_id = p_user_id and role = p_role;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'role_' || p_status, p_user_id, p_role);
  return user_roles_json(p_user_id);
end;
$$;
revoke execute on function admin_decide_role(uuid, text, text) from public, anon;
grant execute on function admin_decide_role(uuid, text, text) to authenticated;

-- Οι ρόλοι ενός χρήστη, για τη διαχείριση.
create or replace function admin_get_user_roles(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return user_roles_json(p_user_id);
end;
$$;
revoke execute on function admin_get_user_roles(uuid) from public, anon;
grant execute on function admin_get_user_roles(uuid) to authenticated;
