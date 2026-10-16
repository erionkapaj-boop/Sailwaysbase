-- 0134 — Δεν υπάρχουν πια δοκιμαστικοί λογαριασμοί (απόφαση ιδιοκτήτη 16/10/2026).
--
-- Η εφαρμογή περνά σε πραγματική λειτουργία: κανείς δεν μπαίνει με ψεύτικο λογαριασμό. Φεύγουν από τον κώδικα το
-- Ghost Mode (σύνδεση χωρίς SMS με κωδικό γραμμένο στον κώδικα), το «Δημιουργία demo» και η σήμανση «λογαριασμός
-- δοκιμών». Εδώ, στη βάση: ούτε δοκιμαστικό τηλέφωνο (+3069800000NN) ούτε σήμανση δοκιμής μπορούν να υπάρξουν σε
-- λογαριασμό, ό,τι κι αν στείλει ο client ή το API. Ο έλεγχος «δύο κόσμοι» (in_test_world) μένει αδρανής: χωρίς
-- δοκιμαστικούς λογαριασμούς, όλοι ανήκουν στον πραγματικό κόσμο.

drop function if exists admin_set_test_account(uuid, boolean);

create or replace function guard_no_test_accounts() returns trigger
language plpgsql as $$
begin
  if is_test_phone(new.phone_number) or coalesce(new.is_test_account, false) then
    raise exception 'test_accounts_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists zz_guard_no_test_accounts on users;
create trigger zz_guard_no_test_accounts before insert or update on users
  for each row execute function guard_no_test_accounts();
