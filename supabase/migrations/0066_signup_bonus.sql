-- ============================================================================
-- Δώρο εγγραφής: 100€ σε κάθε νέο επαγγελματία, 50€ σε κάθε νέο πελάτη,
-- μέχρι και τις 31/12/2026. Πιστώνεται αυτόματα τη στιγμή που δημιουργείται
-- η γραμμή στο users (η εγγραφή), όχι αργότερα — ισχύει είτε ολοκληρώσει
-- κάποιος το προφίλ του είτε όχι, αφού η υπόσχεση είναι για την ίδια την
-- εγγραφή, όχι για κάτι παραπέρα.
--
-- SECURITY DEFINER + platform.trusted γιατί η εγγραφή users γίνεται
-- απευθείας από τον ίδιο τον καινούριο χρήστη (createUserDraft στο db.js) —
-- η πίστωση στο πορτοφόλι και η γραμμή στο wallet_transactions είναι
-- προνομιακές ενέργειες που δεν πρέπει να εξαρτώνται από τα δικαιώματα
-- εγγραφής του ίδιου του νέου λογαριασμού.
--
-- Ξαναχρησιμοποιεί τον τύπο 'deposit' αντί να προσθέσει καινούρια τιμή στο
-- wallet_txn_type enum — μια ALTER TYPE ... ADD VALUE δεν μπορεί να
-- χρησιμοποιηθεί μέσα στο ίδιο script/transaction που την προσθέτει
-- (το δοκίμασα: "unsafe use of new value ... must be committed first").
-- ============================================================================

create or replace function apply_signup_bonus() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bonus numeric;
begin
  if current_date > date '2026-12-31' then
    return new;
  end if;

  if new.role = 'client' then
    v_bonus := 50;
  elsif new.role = 'skipper' then
    v_bonus := 100;
  else
    return new;
  end if;

  perform set_config('platform.trusted', 'true', true);
  update users set wallet_balance = wallet_balance + v_bonus where id = new.id;
  insert into wallet_transactions (user_id, type, amount) values (new.id, 'deposit', v_bonus);

  return new;
end;
$$;

drop trigger if exists trg_signup_bonus on users;
create trigger trg_signup_bonus
  after insert on users
  for each row execute function apply_signup_bonus();
