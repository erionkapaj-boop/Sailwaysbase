-- ============================================================================
-- Ο Erion (πραγματικός skipper λογαριασμός, +306983427643) θέλει να αποκτήσει
-- ΚΑΙ δικαιώματα admin, χωρίς να χάσει τον δικό του κανονικό λογαριασμό —
-- ένα τηλέφωνο, ένα PIN, όλες οι λειτουργίες. Το `role` παραμένει μοναδικό
-- (client/skipper/admin) και ελέγχει ποιο dashboard βλέπει κανείς μπαίνοντας
-- κανονικά· το admin console είναι ξεχωριστή διεύθυνση
-- (/platform/admin/login) με δικό της έλεγχο, οπότε μια δεύτερη, ανεξάρτητη
-- σημαία αρκεί για να την ξεκλειδώσει επιπλέον, χωρίς να αγγίξει το `role`
-- και άρα χωρίς να αλλάξει τίποτα στο κανονικό του dashboard.
--
-- Ο παλιός δοκιμαστικός λογαριασμός admin (+306980000003, χωρίς όνομα) δεν
-- χρειάζεται πια — διαγράφεται.
-- ============================================================================

alter table users add column if not exists is_staff_admin boolean not null default false;

create or replace function guard_users_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  new.is_test_account := old.is_test_account;
  new.is_staff_admin := old.is_staff_admin;
  return new;
end;
$$;

create or replace function admin_set_staff_admin(p_user_id uuid, p_flag boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set is_staff_admin = p_flag where id = p_user_id;
end;
$$;
grant execute on function admin_set_staff_admin(uuid, boolean) to authenticated;

-- is_admin() είναι ο πραγματικός φράχτης πίσω από κάθε RLS policy και admin
-- RPC — χωρίς αυτή την αλλαγή το UI θα άνοιγε αλλά κάθε πραγματική ενέργεια
-- θα σκάγανε με not_admin.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from users where id = auth.uid() and (role = 'admin' or is_staff_admin));
$$;

update users set is_staff_admin = true where phone_number = '+306983427643';

delete from auth.users where id = (select id from users where phone_number = '+306980000003');
