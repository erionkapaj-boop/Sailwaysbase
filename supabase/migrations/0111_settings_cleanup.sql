-- ============================================================================
-- Καθαρισμός στις Ρυθμίσεις:
--
-- 1. `credits_converted` (0110) είναι εσωτερικός δείκτης — μαρτυράει στη
--    migration ότι η μετατροπή ευρώ → credits έγινε ήδη, δεν είναι κάτι να
--    το αλλάξει διαχειριστής. Μέχρι τώρα φαινόταν στις Ρυθμίσεις σαν σωστή
--    ρύθμιση, στην ενότητα «Άλλες», χωρίς καμία εξήγηση. Το admin_list_settings
--    πλέον την αποκρύπτει.
-- 2. `skipper_claim_fee_foreign` ήταν το ξεχωριστό τέλος αποδοχής για
--    επαγγελματία με ξένο κινητό, καταργημένο από το 0064 (ενιαίο τέλος για
--    όλους). Η γραμμή δεν έπρεπε να υπάρχει πια· αν επέζησε σε κάποια βάση
--    (π.χ. δεν είχε τρέξει ποτέ το 0064 σε αυτήν), δεν τη διαβάζει καμία
--    συνάρτηση — ήταν απλώς ορατή, με την παλιά τιμή σε ευρώ, αχρησιμοποίητη.
-- ============================================================================

delete from platform_settings where key = 'skipper_claim_fee_foreign';

create or replace function admin_list_settings()
returns setof platform_settings
language sql stable security definer set search_path = public as $$
  select * from platform_settings
   where is_admin() and key not in ('credits_converted')
   order by key;
$$;
