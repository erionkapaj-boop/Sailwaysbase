-- ============================================================================
-- Διόρθωση υπολοίπου από τον admin.
--
-- Μέχρι τώρα ο admin μπορούσε μόνο να προσθέσει χρήματα (admin_credit_wallet).
-- Μια λάθος πίστωση (1.000€ αντί για 100€) δεν διορθωνόταν με κανέναν τρόπο.
-- Τώρα:
--   - admin_adjust_wallet: προσθέτει ή αφαιρεί ποσό, με υποχρεωτικό λόγο.
--     Ποτέ κάτω από το μηδέν.
--   - Κάθε κίνηση που κάνει admin κρατά ποιος την έκανε και γιατί, πάνω στην
--     ίδια την κίνηση (όχι μόνο στο admin_actions), ώστε να φαίνεται και στο
--     ιστορικό του χρήστη.
--   - Νέο είδος κίνησης 'adjustment', ώστε μια διόρθωση να μη μετρά ούτε ως
--     κατάθεση ούτε ως έσοδο/επιστροφή της πλατφόρμας.
--
-- Η επιβεβαίωση για μεγάλα ποσά (πάνω από 200€) γίνεται στην οθόνη.
-- ============================================================================
alter type wallet_txn_type add value if not exists 'adjustment';

alter table wallet_transactions add column if not exists note text;
alter table wallet_transactions add column if not exists created_by uuid references users(id);

create or replace function admin_credit_wallet(p_user_id uuid, p_amount numeric, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from users where id = p_user_id) then raise exception 'invalid_role'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id;
  insert into wallet_transactions (user_id, type, amount, note, created_by)
    values (p_user_id, 'deposit', p_amount, nullif(btrim(p_notes), ''), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'credit_wallet', p_user_id, coalesce(nullif(btrim(p_notes), ''), '') || ' (+' || p_amount || '€)');
end;
$$;

create or replace function admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_reason text) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_balance numeric;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  select wallet_balance into v_balance from users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_balance + p_amount < 0 then raise exception 'insufficient_wallet'; end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + p_amount where id = p_user_id
    returning wallet_balance into v_balance;
  insert into wallet_transactions (user_id, type, amount, note, created_by)
    values (p_user_id, 'adjustment', p_amount, btrim(p_reason), auth.uid());
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'adjust_wallet', p_user_id,
            btrim(p_reason) || ' (' || case when p_amount > 0 then '+' else '' end || p_amount || '€)');
  return v_balance;
end;
$$;

revoke execute on function admin_adjust_wallet(uuid, numeric, text) from public, anon;
grant execute on function admin_adjust_wallet(uuid, numeric, text) to authenticated;
