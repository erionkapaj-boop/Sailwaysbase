-- ============================================================================
-- Το κλείδωμα μετά από 3 λάθος κωδικούς λήγει μόνο του μετά από 15 λεπτά.
--
-- Μέχρι τώρα μετρούσαν όλες οι αποτυχίες από την τελευταία επιτυχημένη
-- σύνδεση, χωρίς χρονικό όριο — και μια επιτυχημένη σύνδεση ήταν αδύνατη όσο
-- ίσχυε το κλείδωμα. Ξεκλείδωνε μόνο με νέο κωδικό μέσω SMS, που δεν είναι
-- ενεργό στο production (0075). Αποτέλεσμα: 3 λάθη = μόνιμα κλειδωμένος
-- λογαριασμός, για πελάτες, επαγγελματίες και τον ίδιο τον admin.
--
-- Τώρα μετράνε μόνο οι αποτυχίες των τελευταίων 15 λεπτών (και μετά την
-- τελευταία επιτυχία). Ο περιορισμός παραμένει: 3 προσπάθειες ανά 15 λεπτά.
-- Ίδια υπογραφή — το create or replace αρκεί.
-- ============================================================================

create or replace function check_login_rate_limit(p_phone text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_fails int;
begin
  select count(*) into v_fails
  from login_attempts
  where phone = p_phone
    and success = false
    and created_at > now() - interval '15 minutes'
    and created_at > coalesce(
      (select max(created_at) from login_attempts where phone = p_phone and success = true),
      '-infinity'::timestamptz
    );
  return v_fails < 3;
end;
$$;
grant execute on function check_login_rate_limit(text) to anon, authenticated;
