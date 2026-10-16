-- Αναφορά πριν και μετά το format (μόνο διαβάζει, δεν αλλάζει τίποτα).
-- Κάθε πίνακας της εφαρμογής με το πλήθος γραμμών και τι θα γίνει: ΣΒΗΝΕΤΑΙ ή ΜΕΝΕΙ.
-- Μετά το format: όλοι οι «ΣΒΗΝΕΤΑΙ» πίνακες έχουν 0· οι «ΜΕΝΕΙ» (λίστες, ρυθμίσεις) δεν αλλάζουν.
select
  case
    when t.table_name in ('users', 'client_profiles', 'skipper_profiles', 'user_phones', 'user_languages', 'skipper_boat_types', 'skipper_coverage_areas', 'skipper_secondary_roles')
      then 'ΜΕΝΟΥΝ ΜΟΝΟ ΟΣΑ ΤΟΥ ΙΔΙΟΚΤΗΤΗ'
    when t.table_name in ('boat_types', 'languages', 'nationalities', 'platform_config', 'platform_settings', 'ports', 'regions', 'place_positions', 'push_config')
      then 'ΜΕΝΕΙ'
    else 'ΣΒΗΝΕΤΑΙ'
  end as ti_γινεται,
  t.table_name as πινακας,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text::int as γραμμες
from information_schema.tables t
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
union all
select 'ΛΟΓΑΡΙΑΣΜΟΙ ΣΥΝΔΕΣΗΣ (auth)', 'auth.users', (select count(*) from auth.users)
union all
select 'ΜΕΝΕΙ Ο ΙΔΙΟΚΤΗΤΗΣ', coalesce((select full_name || ' · ' || phone_number || ' · ' || role::text from public.users where is_owner and phone_number = '+306983427643'), 'ΔΕΝ ΒΡΕΘΗΚΕ'), (select count(*) from public.users where is_owner and phone_number = '+306983427643')
order by 1, 2;
