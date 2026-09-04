-- ============================================================================
-- Ζητήθηκε ρητά: όποιο προφίλ κι αν έχει κάποιος (πελάτης, επαγγελματίας,
-- και οι δύο), τα προσωπικά του στοιχεία — φωτογραφία, εθνικότητα, γλώσσες —
-- να αντλούνται από ΜΙΑ κοινή πηγή, όχι από ξεχωριστά αντίγραφα ανά ρόλο. Το
-- bug με τον «Εριόν» (0080) ήταν ένα σύμπτωμα αυτού ακριβώς: users.photo_url
-- και skipper_profiles.photo_url μπορούσαν να αποσυγχρονιστούν επειδή ήταν
-- δύο πραγματικά διαφορετικά κελιά, με ένα εύθραυστο sync-on-save ανάμεσά
-- τους (updateSkipperProfile/setSkipperLookups). Αυτό το migration τα κάνει
-- πραγματικά ένα.
--
-- ΔΕΝ αγγίζει το full_name: skipper_profiles.full_name εξυπηρετεί άλλο σκοπό
-- (όνομα «όπως στην άδεια», για εντοπισμό διπλοεγγραφών — βλ. §3 στο 0001),
-- ρητή απόφαση να μείνει χωριστό.
--
-- Τρία πεδία ενοποιούνται:
--   1. photo_url      — έμενε ήδη σε users, καταργείται από skipper_profiles.
--   2. nationality_id  — νέα στήλη users.nationality_id, καταργείται από
--      skipper_profiles ΚΑΙ client_profiles.
--   3. γλώσσες        — νέος πίνακας user_languages, αντικαθιστά τους δύο
--      χωριστούς skipper_languages/client_languages.
--
-- Σειρά ΕΠΙΤΗΔΕΣ έτσι: πρώτα προστίθενται/γεμίζουν οι νέες στήλες/πίνακας,
-- μετά ξαναγράφονται όλες οι όψεις/συναρτήσεις που κοιτούσαν τις παλιές
-- στήλες, και μόνο ΤΕΛΕΥΤΑΙΑ διαγράφονται οι παλιές στήλες/πίνακες — αλλιώς
-- η Postgres αρνείται να κάνει drop table/column σε κάτι που ακόμα
-- χρησιμοποιεί ένα view/function που δεν έχει ξαναγραφτεί ακόμα.
--
-- Idempotent ως προς τα ίδια δεδομένα (τα update/insert δεν κάνουν κακό αν
-- ξανατρέξουν) — ΔΕΝ είναι ασφαλές να ξανατρέξει ολόκληρο μετά την πρώτη
-- επιτυχή εκτέλεση, γιατί κάνει drop table/column· τρέχεται μία φορά.
-- ============================================================================

-- ---- 1. users.nationality_id: η νέα κοινή στήλη. Προτεραιότητα στην τιμή
-- του skipper_profiles (η επαγγελματική είναι αυτή που έχει πραγματικά
-- επιβεβαιωθεί/χρησιμοποιηθεί σε αναζητήσεις), μετά client_profiles. ----
alter table users add column if not exists nationality_id uuid references nationalities(id);

update users u set nationality_id = sp.nationality_id
from skipper_profiles sp
where sp.user_id = u.id and sp.nationality_id is not null and u.nationality_id is null;

update users u set nationality_id = cp.nationality_id
from client_profiles cp
where cp.user_id = u.id and cp.nationality_id is not null and u.nationality_id is null;

-- ---- 2. users.photo_url: backfill από skipper_profiles όπου υπάρχει —
-- ακριβώς το κενό που άφηνε τον «Εριόν» χωρίς φωτογραφία στη δική του
-- σελίδα προφίλ ενώ οι πελάτες την έβλεπαν κανονικά. ----
update users u set photo_url = sp.photo_url
from skipper_profiles sp
where sp.user_id = u.id and sp.photo_url is not null;

-- ---- 3. user_languages: ενιαίος πίνακας, αντικαθιστά skipper_languages
-- (keyed by skipper_profiles.id) και client_languages (keyed by users.id
-- ήδη). Ορατότητα: δημόσια όποτε ο χρήστης είναι εγκεκριμένος επαγγελματίας
-- (ίδιο με το παλιό "no PII" του skipper_languages), αλλιώς ιδιωτική στον
-- ίδιο/admin/επαγγελματία στον οποίο έχει στείλει αίτημα (ίδιο με το παλιό
-- client_languages). Ένα άτομο που είναι και τα δύο έχει πλέον ένα μόνο
-- σύνολο γλωσσών, ορατό δημόσια (ως επαγγελματίας υπερισχύει). ----
create table if not exists user_languages (
  user_id uuid not null references users(id) on delete cascade,
  language_id uuid not null references languages(id) on delete cascade,
  primary key (user_id, language_id)
);
alter table user_languages enable row level security;

-- Ένα RLS policy πάνω σε user_languages δεν μπορεί να διαβάσει απευθείας
-- ΞΕΝΕΣ γραμμές του skipper_profiles για να αποφασίσει «είναι εγκεκριμένος
-- επαγγελματίας;» — το SELECT policy του ίδιου του skipper_profiles
-- (0001/0003: μόνο ο ίδιος/admin/πελάτης με κοινή κράτηση) θα τις έκρυβε
-- πρώτα, πριν καν φτάσει ο έλεγχος εδώ, κάνοντας το exists() πάντα false
-- για κάθε τρίτο. Ίδιο μάθημα με το ήδη υπάρχον client_shares_booking_with_
-- skipper: μια SECURITY DEFINER συνάρτηση παρακάμπτει εσωτερικά αυτό το RLS,
-- ακριβώς όπως ήδη κάνει το skipper_public view για τη δημόσια αναζήτηση.
create or replace function is_approved_professional(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from skipper_profiles
    where user_id = p_user_id and deleted_at is null and approval_status = 'approved'
  );
$$;

drop policy if exists "user languages public read for professionals" on user_languages;
create policy "user languages public read for professionals" on user_languages for select using (
  is_approved_professional(user_languages.user_id)
  or user_id = auth.uid()
  or is_admin()
  or exists (
    select 1 from booking_requests br
    join booking_request_pings p on p.booking_request_id = br.id
    join skipper_profiles sp on sp.id = p.skipper_id
    where br.client_id = user_languages.user_id and sp.user_id = auth.uid()
  )
);

drop policy if exists "user languages owner write" on user_languages;
create policy "user languages owner write" on user_languages for all using (
  user_id = auth.uid()
) with check (
  user_id = auth.uid()
);

insert into user_languages (user_id, language_id)
select distinct sp.user_id, sl.language_id
from skipper_languages sl
join skipper_profiles sp on sp.id = sl.skipper_id
on conflict do nothing;

insert into user_languages (user_id, language_id)
select distinct cl.client_id, cl.language_id
from client_languages cl
on conflict do nothing;

-- ---- 4. skipper_public: ίδιες ακριβώς στήλες εξόδου, οι photo_url/
-- nationality_*/languages τώρα αντλούνται από users/user_languages αντί για
-- τις skipper_profiles.photo_url/nationality_id/skipper_languages (που
-- διαγράφονται πιο κάτω, στο βήμα 12). create or replace αρκεί — καμία
-- στήλη εξόδου δεν αλλάζει όνομα/σειρά. ----
create or replace view skipper_public as
  select sp.id, sp.role, u.photo_url, sp.gender, sp.years_experience, sp.license_type, sp.price_per_day,
         sp.rating_avg, sp.rating_count,
         case
           when (sp.completed_bookings_count + sp.cancellation_flag_count)
                < (select value from platform_settings where key = 'reliability_min_history')
           then null
           else sp.reliability_percentage
         end as reliability_percentage,
         sp.tier,
         sp.rating_avg_safety, sp.rating_avg_seamanship, sp.rating_avg_professionalism,
         sp.rating_avg_cleanliness, sp.rating_avg_communication, sp.rating_avg_hospitality,
         sp.rating_avg_cooking, sp.rating_avg_service,
         sp.rating_avg_taste, sp.rating_avg_variety, sp.rating_avg_presentation,
         sp.rating_avg_adaptability, sp.rating_avg_organization,
         sp.rating_avg_maintenance, sp.rating_avg_teamwork, sp.rating_avg_diligence,
         (select n.name from nationalities n where n.id = u.nationality_id) as nationality_name,
         (select array_agg(l.name order by l.name)
            from user_languages ul join languages l on l.id = ul.language_id
            where ul.user_id = sp.user_id) as languages,
         (select n.flag_emoji from nationalities n where n.id = u.nationality_id) as nationality_flag,
         date_part('year', age(current_date, sp.date_of_birth))::int as age,
         (select n.country_name from nationalities n where n.id = u.nationality_id) as nationality_country
  from skipper_profiles sp
  join users u on u.id = sp.user_id
  where sp.approval_status = 'approved' and sp.deleted_at is null
  union all
  select sp.id, ssr.role, u.photo_url, sp.gender, ssr.years_experience, ssr.license_type, ssr.price_per_day,
         ssr.rating_avg, ssr.rating_count,
         case
           when (sp.completed_bookings_count + sp.cancellation_flag_count)
                < (select value from platform_settings where key = 'reliability_min_history')
           then null
           else sp.reliability_percentage
         end,
         sp.tier,
         ssr.rating_avg_safety, ssr.rating_avg_seamanship, ssr.rating_avg_professionalism,
         ssr.rating_avg_cleanliness, ssr.rating_avg_communication, ssr.rating_avg_hospitality,
         ssr.rating_avg_cooking, ssr.rating_avg_service,
         ssr.rating_avg_taste, ssr.rating_avg_variety, ssr.rating_avg_presentation,
         ssr.rating_avg_adaptability, ssr.rating_avg_organization,
         ssr.rating_avg_maintenance, ssr.rating_avg_teamwork, ssr.rating_avg_diligence,
         (select n.name from nationalities n where n.id = u.nationality_id),
         (select array_agg(l.name order by l.name)
            from user_languages ul join languages l on l.id = ul.language_id
            where ul.user_id = sp.user_id),
         (select n.flag_emoji from nationalities n where n.id = u.nationality_id),
         date_part('year', age(current_date, sp.date_of_birth))::int,
         (select n.country_name from nationalities n where n.id = u.nationality_id)
  from skipper_secondary_roles ssr
  join skipper_profiles sp on sp.id = ssr.skipper_id
  join users u on u.id = sp.user_id
  where ssr.approval_status = 'approved' and ssr.deleted_at is null and sp.deleted_at is null;

-- ---- 5. search_available_skippers: το φίλτρο γλώσσας τώρα περνάει μέσα από
-- user_languages, με join πίσω σε skipper_profiles για να βρεθεί το user_id
-- (το skipper_public.id είναι το skipper_profiles.id, όχι user_id). Ίδια
-- υπογραφή με το 0068 — απλό create or replace. ----
create or replace function search_available_skippers(
  p_start date,
  p_end date,
  p_region_id uuid,
  p_boat_type_id uuid,
  p_max_price numeric default null,
  p_gender text default null,
  p_crew_role crew_role default 'skipper',
  p_language_id uuid default null
) returns setof skipper_public
language sql stable security definer set search_path = public as $$
  select sp.* from skipper_public sp
  where sp.role = p_crew_role
    and (
      p_crew_role <> 'skipper' or exists (
        select 1 from skipper_boat_types bt where bt.skipper_id = sp.id and bt.boat_type_id = p_boat_type_id
      )
    )
    and not exists (
      select 1 from skipper_profiles own where own.id = sp.id and own.user_id = auth.uid()
    )
    and net_availability(sp.id, null, p_region_id, p_crew_role) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and (p_max_price is null or sp.price_per_day <= p_max_price)
    and (p_gender is null or sp.gender = p_gender)
    and (
      p_language_id is null or exists (
        select 1 from user_languages ul
        join skipper_profiles spx on spx.user_id = ul.user_id
        where spx.id = sp.id and ul.language_id = p_language_id
      )
    )
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           skipper_rank_score(
             sp.rating_avg,
             sp.rating_count,
             cancellation_standing(sp.id),
             skipper_response_rate(sp.id)
           ) desc;
$$;

-- ---- 6. get_booking_counterpart: η φωτογραφία είναι πια μία τιμή, όχι δύο
-- να διαλέξεις ανάμεσά τους — το coalesce/case ανά κατεύθυνση καταργείται.
-- Ίδια υπογραφή με το 0065. ----
create or replace function get_booking_counterpart(p_booking_id uuid)
returns table(user_id uuid, full_name text, phone_number text, photo_url text, crew_role crew_role)
language plpgsql stable security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_uid uuid := auth.uid();
  v_counterpart_uid uuid;
  v_counterpart_is_client boolean;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;

  if v_booking.status not in ('confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_skipper') then
    raise exception 'not_revealed';
  end if;

  if v_uid = v_booking.client_id then
    select sp.user_id into v_counterpart_uid from skipper_profiles sp where sp.id = v_booking.skipper_id;
    v_counterpart_is_client := false;
  elsif exists (select 1 from skipper_profiles sp where sp.id = v_booking.skipper_id and sp.user_id = v_uid) then
    v_counterpart_uid := v_booking.client_id;
    v_counterpart_is_client := true;
  else
    raise exception 'not_participant';
  end if;

  return query
    select
      u.id,
      coalesce(nullif(btrim(u.full_name), ''), sp2.full_name),
      u.phone_number,
      u.photo_url,
      case when v_counterpart_is_client then null else v_booking.crew_role end
    from users u
    left join skipper_profiles sp2 on sp2.user_id = u.id
    where u.id = v_counterpart_uid;
end;
$$;

-- ---- 7. get_delivery_booking_counterpart: ίδια απλοποίηση, ίδια υπογραφή
-- με το 0067. ----
create or replace function get_delivery_booking_counterpart(p_delivery_booking_id uuid)
returns table(user_id uuid, full_name text, phone_number text, photo_url text, crew_role crew_role)
language plpgsql stable security definer set search_path = public as $$
declare
  v_booking delivery_bookings%rowtype;
  v_uid uuid := auth.uid();
  v_counterpart_uid uuid;
  v_counterpart_is_client boolean;
begin
  select * into v_booking from delivery_bookings where id = p_delivery_booking_id;
  if not found then raise exception 'booking_not_found'; end if;

  if v_uid = v_booking.client_id then
    select sp.user_id into v_counterpart_uid from skipper_profiles sp where sp.id = v_booking.skipper_id;
    v_counterpart_is_client := false;
  elsif exists (select 1 from skipper_profiles sp where sp.id = v_booking.skipper_id and sp.user_id = v_uid) then
    v_counterpart_uid := v_booking.client_id;
    v_counterpart_is_client := true;
  else
    raise exception 'not_participant';
  end if;

  return query
    select
      u.id,
      coalesce(nullif(btrim(u.full_name), ''), sp2.full_name),
      u.phone_number,
      u.photo_url,
      case when v_counterpart_is_client then null else v_booking.crew_role end
    from users u
    left join skipper_profiles sp2 on sp2.user_id = u.id
    where u.id = v_counterpart_uid;
end;
$$;

-- ---- 8. admin_list_accounts: photo_url πια μία τιμή, όχι coalesce. Ίδια
-- υπογραφή με το 0078 — απλό create or replace. ----
create or replace function admin_list_accounts(
  p_role user_role default null,
  p_crew_role crew_role default null,
  p_search text default '',
  p_sort text default 'recent',
  p_limit int default 200,
  p_invisible_only boolean default false,
  p_deleted_only boolean default false,
  p_pending_verification_only boolean default false,
  p_suspended_only boolean default false
)
returns table(
  id uuid, role user_role, crew_role crew_role, full_name text, phone_number text, email text,
  status user_status, approval_status skipper_approval_status, created_at timestamptz,
  last_seen_at timestamptz, date_of_birth date, rating_avg numeric, rating_count int,
  reliability_percentage numeric, completed_bookings_count int, tier skipper_tier,
  is_test_account boolean, photo_url text, phone_verified_at timestamptz, suspension_reason text
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
    u.is_test_account,
    u.photo_url,
    u.phone_verified_at,
    u.suspension_reason
  from users u
  left join skipper_profiles sp on sp.user_id = u.id and sp.deleted_at is null
  left join client_profiles cp on cp.user_id = u.id
  where is_admin()
    and (case when p_deleted_only then u.status = 'deleted' else u.status <> 'deleted' end)
    and (not p_pending_verification_only or (u.phone_verified_at is null and u.role <> 'admin'))
    and (not p_suspended_only or u.status = 'suspended')
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

-- ---- 9. admin_search_availability: photo_url από users αντί για
-- skipper_profiles· ήδη κάνει join στο users, χρειάζεται μόνο η αλλαγή της
-- πηγής. Ίδια υπογραφή με το 0027. ----
create or replace function admin_search_availability(
  p_role crew_role default 'skipper',
  p_start date default current_date,
  p_end date default current_date,
  p_port_id uuid default null
)
returns table(
  skipper_id uuid,
  user_id uuid,
  full_name text,
  phone_number text,
  crew_role crew_role,
  price_per_day numeric,
  rating_avg numeric,
  rating_count int,
  reliability_percentage numeric,
  tier skipper_tier,
  photo_url text
)
language sql stable security definer set search_path = public as $$
  select
    sp.id, sp.user_id, sp.full_name, u.phone_number, sp.role,
    sp.price_per_day, sp.rating_avg, sp.rating_count,
    sp.reliability_percentage, sp.tier, u.photo_url
  from skipper_profiles sp
  join users u on u.id = sp.user_id
  where is_admin()
    and sp.approval_status = 'approved'
    and sp.deleted_at is null
    and sp.role = p_role
    and net_availability(sp.id, p_port_id) @> daterange(p_start, p_end, '[]')
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
  order by
    case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
    skipper_rank_score(sp.rating_avg, sp.rating_count, cancellation_standing(sp.id),
                       skipper_response_rate(sp.id)) desc;
$$;

-- ---- 10. list_my_delivery_requests: το photo_url μέσα στο jsonb payload
-- των pings τώρα διαβάζεται από users αντί για skipper_profiles. Ίδια
-- υπογραφή με το 0067. ----
create or replace function list_my_delivery_requests()
returns table(
  request delivery_requests,
  role_requests jsonb
)
language sql stable security definer set search_path = public as $$
  select dr, coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', rr.id, 'crew_role', rr.crew_role, 'offered_price', rr.offered_price,
      'client_fee', rr.client_fee, 'professional_fee', rr.professional_fee,
      'status', rr.status, 'expires_at', rr.expires_at, 'created_at', rr.created_at,
      'pings', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'skipper_id', p.skipper_id, 'status', p.status,
          'full_name', sp.full_name, 'photo_url', u.photo_url
        ) order by p.sent_at), '[]'::jsonb)
        from delivery_role_pings p
        join skipper_profiles sp on sp.id = p.skipper_id
        join users u on u.id = sp.user_id
        where p.delivery_role_request_id = rr.id
      ),
      'booking', (
        select to_jsonb(b) from delivery_bookings b where b.delivery_role_request_id = rr.id
      )
    ) order by rr.created_at)
    from delivery_role_requests rr where rr.delivery_request_id = dr.id
  ), '[]'::jsonb)
  from delivery_requests dr
  where dr.client_id = auth.uid()
  order by dr.created_at desc;
$$;

-- ---- 11. Καθαρά πλέον ασφαλές να φύγουν οι παλιοί πίνακες γλωσσών — καμία
-- όψη/συνάρτηση δεν τους αναφέρει πια μετά τα βήματα 4/5 παραπάνω. ----
drop table skipper_languages;
drop table client_languages;

-- ---- 12. Και οι πλέον περιττές στήλες — καμία όψη/συνάρτηση δεν τις
-- αναφέρει πια μετά τα βήματα 4/6/7/8/9/10 παραπάνω. ----
alter table skipper_profiles drop column if exists photo_url;
alter table skipper_profiles drop column if exists nationality_id;
alter table client_profiles drop column if exists nationality_id;
