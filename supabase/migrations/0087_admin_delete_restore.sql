-- ============================================================================
-- Ο admin μπορεί να διαγράψει οποιονδήποτε λογαριασμό — και να τον επαναφέρει.
--
-- Μέχρι τώρα η διαγραφή από τον admin περνούσε από το ίδιο soft_delete_account
-- με την αυτοεξυπηρέτηση, που αρνείται όταν υπάρχει ανοιχτό αίτημα ή
-- επιβεβαιωμένη κράτηση, και ποτέ για staff admin. Και η μόνη επιστροφή ήταν
-- να ξαναγραφτεί ο ίδιος ο χρήστης με το ίδιο τηλέφωνο.
--
-- Η διαγραφή μένει «ήπια», όπως παντού (0074): ο λογαριασμός κρύβεται και δεν
-- μπορεί να συνδεθεί, αλλά τίποτα δεν σβήνεται — ιστορικό, αξιολογήσεις,
-- τηλέφωνο, κωδικός μένουν. Γι' αυτό η επαναφορά είναι απλώς το αντίστροφο.
--
-- Τι κάνει επιπλέον η διαγραφή από admin, ώστε να μη μείνει κανείς να
-- περιμένει κάποιον που δεν υπάρχει πια:
--   - ανοιχτά αιτήματα του χρήστη (πλήρωμα και μεταφορά) ακυρώνονται και το
--     τέλος επιστρέφεται ως credit — ίδια λογική με cancel_booking_request;
--   - αναπάντητα αιτήματα προς αυτόν (αν είναι επαγγελματίας) αφαιρούνται.
-- Επιβεβαιωμένες κρατήσεις ΔΕΝ ακυρώνονται — αυτό είναι δική σου απόφαση·
-- η σελίδα του χρήστη σε προειδοποιεί πριν πατήσεις.
-- ============================================================================

alter table users add column if not exists deleted_at timestamptz;
alter table users add column if not exists deletion_reason text;

-- Πότε διαγράφηκε, για κάθε δρόμο διαγραφής (αυτοεξυπηρέτηση, admin) και
-- καθαρισμός σε κάθε δρόμο επιστροφής (επαναφορά admin, επανεγγραφή 0074).
create or replace function users_track_deletion() returns trigger
language plpgsql as $$
begin
  if new.status = 'deleted' and old.status is distinct from 'deleted' then
    new.deleted_at := coalesce(new.deleted_at, now());
  elsif old.status = 'deleted' and new.status is distinct from 'deleted' then
    new.deleted_at := null;
    new.deletion_reason := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_users_track_deletion on users;
create trigger trg_users_track_deletion
  before update of status on users
  for each row execute function users_track_deletion();

-- ----------------------------------------------------------------------------
-- Διαγραφή από admin.
-- ----------------------------------------------------------------------------
create or replace function admin_delete_account(p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row users%rowtype;
  v_skipper_id uuid;
  v_req record;
  v_rr record;
  v_cancelled int := 0;
  v_refunded numeric := 0;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_row from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status = 'deleted' then raise exception 'already_deleted'; end if;
  if v_row.role = 'admin' then raise exception 'cannot_delete_admin'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_delete_self'; end if;

  perform set_config('platform.trusted', 'true', true);

  -- Ανοιχτά αιτήματα πληρώματος του χρήστη → ακύρωση + επιστροφή τέλους.
  for v_req in
    select id, fee_paid_at, fee_amount from booking_requests
    where client_id = p_user_id and status = 'open' for update
  loop
    update booking_requests set status = 'cancelled' where id = v_req.id;
    delete from booking_request_pings where booking_request_id = v_req.id and status = 'pending';
    if v_req.fee_paid_at is not null and v_req.fee_amount > 0 then
      update users set wallet_balance = wallet_balance + v_req.fee_amount where id = p_user_id;
      insert into wallet_transactions (user_id, type, amount, related_booking_request_id)
        values (p_user_id, 'refund_credit', v_req.fee_amount, v_req.id);
      v_refunded := v_refunded + v_req.fee_amount;
    end if;
    v_cancelled := v_cancelled + 1;
  end loop;

  -- Ανοιχτές θέσεις σε αιτήματα μεταφοράς του χρήστη → ακύρωση + επιστροφή.
  for v_rr in
    select rr.id, rr.fee_paid_at, rr.client_fee
    from delivery_role_requests rr join delivery_requests dr on dr.id = rr.delivery_request_id
    where dr.client_id = p_user_id and rr.status = 'open' for update of rr
  loop
    update delivery_role_requests set status = 'cancelled' where id = v_rr.id;
    delete from delivery_role_pings where delivery_role_request_id = v_rr.id and status = 'pending';
    if v_rr.fee_paid_at is not null and v_rr.client_fee > 0 then
      update users set wallet_balance = wallet_balance + v_rr.client_fee where id = p_user_id;
      insert into wallet_transactions (user_id, type, amount, related_delivery_role_request_id)
        values (p_user_id, 'refund_credit', v_rr.client_fee, v_rr.id);
      v_refunded := v_refunded + v_rr.client_fee;
    end if;
    v_cancelled := v_cancelled + 1;
  end loop;

  -- Επαγγελματίας: κρύβεται από αναζητήσεις, και φεύγει από όσα αιτήματα
  -- δεν έχει απαντήσει ακόμα.
  select id into v_skipper_id from skipper_profiles where user_id = p_user_id;
  if v_skipper_id is not null then
    delete from booking_request_pings where skipper_id = v_skipper_id and status = 'pending';
    delete from delivery_role_pings where skipper_id = v_skipper_id and status = 'pending';
    update skipper_profiles set deleted_at = now() where id = v_skipper_id and deleted_at is null;
    update skipper_secondary_roles set deleted_at = now() where skipper_id = v_skipper_id and deleted_at is null;
  end if;

  -- Τα δικαιώματα διαχειριστή δεν επιστρέφουν αυτόματα με μια επαναφορά.
  update users
    set status = 'deleted',
        deletion_reason = nullif(btrim(coalesce(p_reason, '')), ''),
        is_staff_admin = false
    where id = p_user_id;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', p_user_id,
      'Διαγραφή από admin' || coalesce(': ' || nullif(btrim(coalesce(p_reason, '')), ''), '') || '.');

  return jsonb_build_object('cancelled_requests', v_cancelled, 'refunded', v_refunded);
end;
$$;
grant execute on function admin_delete_account(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Επαναφορά διαγραμμένου λογαριασμού. Ίδιο κανόνα κατάστασης με την επαναφορά
-- από αναστολή (0078): 'draft' αν ο επαγγελματίας δεν είχε εγκριθεί ακόμα.
-- Επιστρέφουν μόνο οι επιπλέον ιδιότητες που κρύφτηκαν μαζί με το προφίλ
-- (ίδια ακριβώς στιγμή deleted_at) — όχι όσες είχαν αφαιρεθεί νωρίτερα.
-- ----------------------------------------------------------------------------
create or replace function admin_restore_account(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row users%rowtype;
  v_sp skipper_profiles%rowtype;
  v_new_status user_status;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_row from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_row.status <> 'deleted' then raise exception 'not_deleted'; end if;

  select * into v_sp from skipper_profiles where user_id = p_user_id;
  v_new_status := case
    when v_sp.id is not null and v_sp.approval_status <> 'approved' then 'draft'
    else 'active'
  end;

  perform set_config('platform.trusted', 'true', true);

  update users set status = v_new_status where id = p_user_id;

  if v_sp.id is not null then
    update skipper_secondary_roles set deleted_at = null
      where skipper_id = v_sp.id and deleted_at = v_sp.deleted_at;
    update skipper_profiles set deleted_at = null where id = v_sp.id;
  end if;

  perform notify_user(p_user_id, 'account_restored', '{}'::jsonb, '/platform');

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'ban_account', p_user_id, 'Επαναφορά διαγραμμένου λογαριασμού.');
end;
$$;
grant execute on function admin_restore_account(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Διόρθωση του 0086: η επαναφορά (από εδώ ή από αναστολή, 0078) ζωντανεύει
-- το προφίλ του επαγγελματία χωρίς να είναι νέα έγκριση — δεν πρέπει να του
-- στείλει «Το προφίλ σου εγκρίθηκε». Ίδια συνάρτηση με το 0086, με τον
-- έλεγχο approved_at· το trigger του 0086 δεν αλλάζει.
-- ----------------------------------------------------------------------------
create or replace function notify_skipper_approval_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(btrim(new.full_name), ''), (select full_name from users where id = new.user_id));
  -- Ένας επαγγελματίας που επιστρέφει εγκρίνεται «ζωντανεύοντας» το παλιό
  -- του προφίλ (0037: deleted_at → null, approval_status ήδη 'approved',
  -- νέο approved_at) — μετράει κι αυτό ως απόφαση. Η επαναφορά από αναστολή
  -- ή διαγραφή ζωντανεύει επίσης το προφίλ αλλά δεν αγγίζει το approved_at,
  -- και δεν είναι νέα έγκριση.
  v_revived boolean := tg_op = 'UPDATE' and old.deleted_at is not null
                       and new.approved_at is distinct from old.approved_at;
begin
  if new.deleted_at is not null then return null; end if;

  if new.approval_status = 'pending'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'pending' or old.deleted_at is not null) then
    perform notify_admins(
      'admin_pro_pending',
      jsonb_build_object('name', v_name, 'role', new.role),
      '/platform/admin/approvals'
    );
  end if;

  if tg_op = 'UPDATE' and (new.approval_status is distinct from old.approval_status or v_revived) then
    if new.approval_status = 'approved' then
      perform notify_user(new.user_id, 'profile_approved', jsonb_build_object('role', new.role), '/platform/requests');
    elsif new.approval_status = 'rejected' then
      perform notify_user(
        new.user_id, 'profile_rejected',
        jsonb_build_object('role', new.role, 'revoked', old.approval_status = 'approved' and not v_revived),
        '/platform/requests'
      );
    end if;
  end if;
  return null;
end;
$$;
