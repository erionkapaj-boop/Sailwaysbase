-- ============================================================================
-- «Σύνδεση ως» για λογαριασμούς σημειωμένους ρητά ως δοκιμαστικοί: μια
-- πραγματική εναλλαγή σύνδεσης (όχι απλή προβολή) ώστε ο admin να μπορεί να
-- κάνει κρατήσεις, να στέλνει μηνύματα, να αναζητά — οτιδήποτε θα έκανε ο
-- ίδιος ο λογαριασμός. Η «Προβολή ως» (μόνο ανάγνωση) παραμένει όπως ήταν,
-- για γρήγορη ματιά χωρίς καμία σύνδεση.
--
-- Ο μόνος αξιόπιστος τρόπος να μπει κανείς σε πραγματική σύνδεση χωρίς να
-- ξέρει το PIN του λογαριασμού είναι να το επαναφέρει πρώτα σε μια νέα,
-- τυχαία τιμή (το κάνει ο server μέσω service role, βλ. το επόμενο API
-- route) — γι' αυτό επιτρέπεται ΜΟΝΟ σε λογαριασμούς που ο admin έχει
-- σημειώσει ρητά ως δοκιμαστικούς, ποτέ αυτόματα βάσει τηλεφώνου ή άλλου
-- μοτίβου.
-- ============================================================================

alter table users add column if not exists is_test_account boolean not null default false;

create or replace function guard_users_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role := old.role;
  new.status := old.status;
  new.is_test_account := old.is_test_account;
  return new;
end;
$$;

create or replace function admin_set_test_account(p_user_id uuid, p_is_test boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set is_test_account = p_is_test where id = p_user_id;
end;
$$;
grant execute on function admin_set_test_account(uuid, boolean) to authenticated;

-- admin_list_accounts χρειάζεται is_test_account στη λίστα χρηστών, ώστε το
-- κουμπί «Σύνδεση ως» να εμφανίζεται μόνο εκεί που επιτρέπεται. Νέα στήλη
-- εξόδου -> drop πρώτα (η CREATE OR REPLACE δεν αλλάζει το return type).
--
-- ΔΙΟΡΘΩΣΗ ΠΑΡΑΛΕΙΨΗΣ ΤΟΥ 0032: όταν προστέθηκε εκεί η 6η παράμετρος
-- (p_invisible_only), έγινε με CREATE OR REPLACE χωρίς προηγούμενο DROP της
-- παλιάς 5-παραμέτρων εκδοχής (0025) — αλλά μια CREATE OR REPLACE με
-- διαφορετική λίστα παραμέτρων δεν αντικαθιστά, δημιουργεί ΔΕΥΤΕΡΗ,
-- παράλληλη υπερφόρτωση. Οι δύο συνυπήρχαν αθόρυβα έκτοτε — κάθε πραγματική
-- κλήση από την εφαρμογή περνάει όλες τις παραμέτρους με όνομα και δεν το
-- έδειχνε, αλλά μια κλήση με λιγότερα ορίσματα (όπως εδώ) γίνεται αμφίσημη.
-- Διαγράφονται και οι δύο παλιές πριν ξαναφτιαχτεί μία.
drop function if exists admin_list_accounts(user_role, crew_role, text, text, int);
drop function if exists admin_list_accounts(user_role, crew_role, text, text, int, boolean);

create function admin_list_accounts(
  p_role user_role default null,
  p_crew_role crew_role default null,
  p_search text default '',
  p_sort text default 'recent',
  p_limit int default 200,
  p_invisible_only boolean default false
)
returns table(
  id uuid,
  role user_role,
  crew_role crew_role,
  full_name text,
  phone_number text,
  email text,
  status user_status,
  approval_status skipper_approval_status,
  created_at timestamptz,
  last_seen_at timestamptz,
  date_of_birth date,
  rating_avg numeric,
  rating_count int,
  reliability_percentage numeric,
  completed_bookings_count int,
  tier skipper_tier,
  is_test_account boolean
)
language sql stable security definer set search_path = public as $$
  select
    u.id, u.role, sp.role,
    coalesce(nullif(sp.full_name, ''), u.full_name),
    u.phone_number, u.email, u.status, sp.approval_status,
    u.created_at, u.last_seen_at, sp.date_of_birth,
    coalesce(sp.rating_avg, cp.rating_avg),
    coalesce(sp.rating_count, cp.rating_count),
    coalesce(sp.reliability_percentage, cp.reliability_percentage),
    coalesce(sp.completed_bookings_count, cp.completed_bookings_count),
    sp.tier,
    u.is_test_account
  from users u
  left join skipper_profiles sp on sp.user_id = u.id and sp.deleted_at is null
  left join client_profiles cp on cp.user_id = u.id
  where is_admin()
    and (p_role is null or u.role = p_role)
    and (p_crew_role is null or sp.role = p_crew_role)
    and (
      coalesce(p_search, '') = ''
      or u.phone_number ilike '%' || p_search || '%'
      or u.full_name ilike '%' || p_search || '%'
      or sp.full_name ilike '%' || p_search || '%'
      or u.email ilike '%' || p_search || '%'
    )
    and (
      not p_invisible_only
      or (sp.id is not null and sp.approval_status = 'approved' and not skipper_is_search_visible(sp.id))
    )
  order by
    case when p_sort = 'name' then coalesce(nullif(sp.full_name, ''), u.full_name) end asc nulls last,
    case when p_sort = 'active' then u.last_seen_at end desc nulls last,
    case when p_sort = 'rating' then
      bayesian_rating(coalesce(sp.rating_avg, cp.rating_avg), coalesce(sp.rating_count, cp.rating_count))
    end desc nulls last,
    case when p_sort = 'bookings' then coalesce(sp.completed_bookings_count, cp.completed_bookings_count) end desc nulls last,
    case when p_sort = 'age' then sp.date_of_birth end asc nulls last,
    u.created_at desc
  limit p_limit;
$$;
grant execute on function admin_list_accounts(user_role, crew_role, text, text, int, boolean) to authenticated;
