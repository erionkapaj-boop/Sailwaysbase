-- ============================================================================
-- Community του SkipperFinder, βήμα 1: μόνο η βάση (απόφαση ιδιοκτήτη 16/10/2026).
--
-- Χώρος όπου οι επαγγελματίες της θάλασσας μοιράζονται πληροφορίες σε κοινό
-- χάρτη (σημεία) και σε ομάδες περιοχών (μηνύματα με απαντήσεις).
--
-- Πρόσβαση: μόνο συνδεδεμένοι, επαληθευμένοι και ενεργοί λογαριασμοί με
-- εγκεκριμένο προφίλ επαγγελματία (κύριος ή δεύτερος ρόλος: skipper, hostess,
-- cook, deckhand). Πελάτες δεν έχουν πρόσβαση. Λογαριασμοί εταιρειών σκαφών δεν
-- υπάρχουν στο σύστημα και κόβονται εκ κατασκευής (δεν είναι επαγγελματίες).
-- Η διαχείριση (is_admin: ιδιοκτήτης και υπάλληλοι) βλέπει τα πάντα και
-- εποπτεύει· τις ρυθμίσεις ανά κατηγορία τις αλλάζει μόνο ο ιδιοκτήτης.
--
-- Κανόνας πρόσβασης στα δεδομένα: οι πίνακες δεν δίνονται ούτε για ανάγνωση
-- ούτε για εγγραφή στον browser. Όλα περνούν από συναρτήσεις (όπως τα ανοιχτά
-- αιτήματα, 0124), που ελέγχουν ποιος ρωτά και τι επιτρέπεται.
--
-- Δομημένα δεδομένα για τις επόμενες εφαρμογές (χωρίς ξαναχτίσιμο):
--   WindNow  → σημεία κατηγορίας 'weather', με details {wind_dir, wind_kn, gust_kn, sea_state}
--   Explore  → σημεία 'useful_place' και 'anchorage', με details {kind, ...}
--   Nearby   → community_presence (προαιρετική, προσωρινή κοινοποίηση θέσης)
--
-- Κείμενο που παράγει η βάση επιστρέφεται ως κωδικός (docs/I18N.md): κατηγορίες,
-- λόγοι αναφοράς, λάθη. Το όνομα των ομάδων είναι δεδομένο (el + en).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ρυθμίσεις ανά κατηγορία (από τη διαχείριση, όχι στον κώδικα)
-- ---------------------------------------------------------------------------
create table if not exists community_category_settings (
  category text primary key check (category in ('hazard', 'weather', 'anchorage', 'useful_place', 'other')),
  show_days int not null check (show_days between 1 and 3650),
  archive_days int not null check (archive_days between 1 and 3650),
  updated_at timestamptz not null default now(),
  check (archive_days >= show_days)
);
alter table community_category_settings enable row level security;
revoke all on community_category_settings from anon, authenticated;

-- Προσωρινές τιμές (docs/PENDING.md): show_days = πόσες ημέρες από την τελευταία
-- επιβεβαίωση φαίνεται στον χάρτη· archive_days = πόσες ημέρες από την τελευταία
-- επιβεβαίωση αρχειοθετείται.
insert into community_category_settings (category, show_days, archive_days) values
  ('hazard', 60, 365),
  ('weather', 2, 30),
  ('anchorage', 365, 1095),
  ('useful_place', 365, 1095),
  ('other', 30, 180)
on conflict (category) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Πίνακες
-- ---------------------------------------------------------------------------
create table if not exists community_points (
  id uuid primary key default gen_random_uuid(),
  category text not null references community_category_settings(category),
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  photo_path text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  author_id uuid not null references users(id) on delete cascade,
  -- Πότε είδε ο συντάκτης το πράγμα (ημερομηνία παρατήρησης)…
  observed_at timestamptz not null,
  -- …και πότε επιβεβαιώθηκε τελευταία φορά ότι ισχύει (ξεχωριστό πεδίο).
  last_confirmed_at timestamptz not null default now(),
  last_confirmed_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'archived', 'removed')),
  archived_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references users(id) on delete set null,
  removed_reason text check (removed_reason is null or char_length(removed_reason) <= 300),
  created_at timestamptz not null default now(),
  check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$')
);
create index if not exists community_points_map on community_points (category, status, expires_at);
create index if not exists community_points_pos on community_points (lat, lng) where status = 'active';
create index if not exists community_points_author on community_points (author_id, created_at desc);
alter table community_points enable row level security;
revoke all on community_points from anon, authenticated;

create table if not exists community_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('point', 'message')),
  point_id uuid references community_points(id) on delete cascade,
  message_id uuid,
  reporter_id uuid not null references users(id) on delete cascade,
  reason text not null check (reason in ('wrong', 'outdated', 'abuse', 'offer', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references users(id) on delete set null,
  resolved_at timestamptz,
  check ((target_type = 'point' and point_id is not null and message_id is null)
      or (target_type = 'message' and message_id is not null and point_id is null))
);
create unique index if not exists community_reports_one_open_point
  on community_reports (reporter_id, point_id) where status = 'open' and point_id is not null;
create unique index if not exists community_reports_one_open_message
  on community_reports (reporter_id, message_id) where status = 'open' and message_id is not null;
create index if not exists community_reports_status on community_reports (status, created_at);
alter table community_reports enable row level security;
revoke all on community_reports from anon, authenticated;

create table if not exists community_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  name_en text not null check (char_length(name_en) between 2 and 60),
  sort_order int not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references users(id) on delete set null,
  closed_reason text check (closed_reason is null or char_length(closed_reason) <= 300),
  created_at timestamptz not null default now()
);
alter table community_groups enable row level security;
revoke all on community_groups from anon, authenticated;

insert into community_groups (slug, name, name_en, sort_order) values
  ('saronic', 'Σαρωνικός', 'Saronic', 1),
  ('aegean', 'Αιγαίο', 'Aegean', 2),
  ('small_cyclades', 'Μικρές Κυκλάδες', 'Small Cyclades', 3),
  ('ionian', 'Ιόνιο', 'Ionian', 4)
on conflict (slug) do nothing;

-- Ένα μέλος σε πολλές ομάδες.
create table if not exists community_group_members (
  group_id uuid not null references community_groups(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists community_group_members_user on community_group_members (user_id);
alter table community_group_members enable row level security;
revoke all on community_group_members from anon, authenticated;

create table if not exists community_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups(id) on delete cascade,
  parent_id uuid references community_messages(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references users(id) on delete set null,
  deleted_reason text check (deleted_reason is null or char_length(deleted_reason) <= 300)
);
create index if not exists community_messages_group on community_messages (group_id, created_at desc);
create index if not exists community_messages_parent on community_messages (parent_id);
alter table community_messages enable row level security;
revoke all on community_messages from anon, authenticated;

alter table community_reports drop constraint if exists community_reports_message_fk;
alter table community_reports add constraint community_reports_message_fk
  foreign key (message_id) references community_messages(id) on delete cascade;

-- Προσωρινός περιορισμός μέλους (δεν γράφει και δεν προσθέτει σημεία· διαβάζει).
create table if not exists community_restrictions (
  user_id uuid primary key references users(id) on delete cascade,
  until timestamptz not null,
  reason text not null check (reason in ('rules', 'offers', 'abuse', 'other')),
  set_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table community_restrictions enable row level security;
revoke all on community_restrictions from anon, authenticated;

-- Nearby (μελλοντική οθόνη): προαιρετική και προσωρινή κοινοποίηση θέσης.
-- Εκτός από τη θέση που δηλώνει ο ίδιος ο χρήστης, δεν αποθηκεύεται ποτέ τίποτα.
create table if not exists community_presence (
  user_id uuid primary key references users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists community_presence_pos on community_presence (lat, lng);
alter table community_presence enable row level security;
revoke all on community_presence from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Βοηθητικά (εσωτερικά, δεν καλούνται από τον browser)
-- ---------------------------------------------------------------------------
-- Επιλέξιμος: ενεργός, επαληθευμένος λογαριασμός με εγκεκριμένο προφίλ
-- επαγγελματία (κύριος ή δεύτερος ρόλος).
create or replace function community_eligible(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users u
     where u.id = p_user and u.role = 'skipper' and u.status = 'active'
       and u.deleted_at is null and u.phone_verified_at is not null
       and exists (
         select 1 from skipper_profiles sp
          where sp.user_id = u.id and sp.deleted_at is null
            and (sp.approval_status = 'approved'
                 or exists (select 1 from skipper_secondary_roles sr
                             where sr.skipper_id = sp.id and sr.deleted_at is null
                               and sr.approval_status = 'approved'))
       )
  );
$$;
revoke execute on function community_eligible(uuid) from public, anon, authenticated;

create or replace function community_restricted(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_restrictions where user_id = p_user and until > now());
$$;
revoke execute on function community_restricted(uuid) from public, anon, authenticated;

-- Ανάγνωση: επιλέξιμος ή διαχείριση. Εγγραφή: επιλέξιμος χωρίς περιορισμό.
create or replace function community_assert_read() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not (community_eligible(auth.uid()) or is_admin()) then raise exception 'community_not_allowed'; end if;
end;
$$;
revoke execute on function community_assert_read() from public, anon, authenticated;

create or replace function community_assert_write() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not community_eligible(auth.uid()) then raise exception 'community_not_allowed'; end if;
  if community_restricted(auth.uid()) then raise exception 'community_restricted'; end if;
end;
$$;
revoke execute on function community_assert_write() from public, anon, authenticated;

create or replace function community_distance_km(p_lat1 double precision, p_lng1 double precision,
                                                 p_lat2 double precision, p_lng2 double precision)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))))
$$;
revoke execute on function community_distance_km(double precision, double precision, double precision, double precision)
  from public, anon, authenticated;

-- Όνομα συντάκτη: μόνο για ενεργούς λογαριασμούς· αλλιώς null (ανώνυμο).
create or replace function community_author_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when u.status = 'active' and u.deleted_at is null then u.full_name end from users u where u.id = p_user;
$$;
revoke execute on function community_author_name(uuid) from public, anon, authenticated;

-- Έλεγχος των δομημένων στοιχείων ανά κατηγορία (κλειστό σύνολο κλειδιών).
create or replace function community_validate_details(p_category text, p_details jsonb)
returns void language plpgsql immutable as $$
declare
  v_key text;
  v_allowed text[];
  v_dirs text[] := array['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
begin
  v_allowed := case p_category
    when 'hazard' then array['kind']
    when 'weather' then array['wind_dir', 'wind_kn', 'gust_kn', 'sea_state']
    when 'anchorage' then array['kind', 'shelter_from', 'depth_m']
    when 'useful_place' then array['kind']
    else array[]::text[] end;
  for v_key in select jsonb_object_keys(p_details) loop
    if not (v_key = any (v_allowed)) then raise exception 'invalid_details'; end if;
  end loop;

  if p_details ? 'kind' then
    if jsonb_typeof(p_details -> 'kind') <> 'string' or not ((p_details ->> 'kind') = any (case p_category
        when 'hazard' then array['rock', 'shoal', 'floating_object', 'fishing_gear', 'other']
        when 'anchorage' then array['anchorage', 'port', 'marina']
        when 'useful_place' then array['fuel', 'water', 'provisions', 'repair', 'restaurant', 'other']
        else array[]::text[] end)) then
      raise exception 'invalid_details';
    end if;
  end if;
  if p_details ? 'wind_dir' and (jsonb_typeof(p_details -> 'wind_dir') <> 'string' or not ((p_details ->> 'wind_dir') = any (v_dirs))) then
    raise exception 'invalid_details';
  end if;
  if p_details ? 'wind_kn' and (jsonb_typeof(p_details -> 'wind_kn') <> 'number' or (p_details ->> 'wind_kn')::numeric not between 0 and 100) then
    raise exception 'invalid_details';
  end if;
  if p_details ? 'gust_kn' and (jsonb_typeof(p_details -> 'gust_kn') <> 'number' or (p_details ->> 'gust_kn')::numeric not between 0 and 120) then
    raise exception 'invalid_details';
  end if;
  if p_details ? 'sea_state' and (jsonb_typeof(p_details -> 'sea_state') <> 'number' or (p_details ->> 'sea_state')::numeric not between 0 and 9) then
    raise exception 'invalid_details';
  end if;
  if p_details ? 'depth_m' and (jsonb_typeof(p_details -> 'depth_m') <> 'number' or (p_details ->> 'depth_m')::numeric not between 0.5 and 200) then
    raise exception 'invalid_details';
  end if;
  if p_details ? 'shelter_from' then
    if jsonb_typeof(p_details -> 'shelter_from') <> 'array'
       or jsonb_array_length(p_details -> 'shelter_from') > 8
       or exists (select 1 from jsonb_array_elements(p_details -> 'shelter_from') e
                   where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (v_dirs))) then
      raise exception 'invalid_details';
    end if;
  end if;
end;
$$;
revoke execute on function community_validate_details(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Πρόσβαση χρήστη
-- ---------------------------------------------------------------------------
create or replace function community_my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'can_read', auth.uid() is not null and (community_eligible(auth.uid()) or is_admin()),
    'can_write', auth.uid() is not null and community_eligible(auth.uid()) and not community_restricted(auth.uid()),
    'moderator', auth.uid() is not null and is_admin(),
    'restricted_until', (select until from community_restrictions where user_id = auth.uid() and until > now())
  );
$$;
revoke execute on function community_my_access() from public, anon;
grant execute on function community_my_access() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Σημεία χάρτη
-- ---------------------------------------------------------------------------
create or replace function community_add_point(
  p_category text, p_title text, p_description text, p_lat double precision, p_lng double precision,
  p_observed_at timestamptz default null, p_photo_path text default null, p_details jsonb default '{}'::jsonb
) returns community_points
language plpgsql security definer set search_path = public as $$
declare
  v_row community_points%rowtype;
  v_show int;
  v_observed timestamptz := coalesce(p_observed_at, now());
begin
  perform community_assert_write();
  select show_days into v_show from community_category_settings where category = p_category;
  if not found then raise exception 'invalid_category'; end if;
  p_title := btrim(coalesce(p_title, ''));
  p_description := btrim(coalesce(p_description, ''));
  if char_length(p_title) < 3 or char_length(p_title) > 80 then raise exception 'invalid_title'; end if;
  if char_length(p_description) > 1000 then raise exception 'invalid_description'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_position';
  end if;
  if v_observed > now() + interval '5 minutes' or v_observed < now() - interval '30 days' then
    raise exception 'invalid_observed_at';
  end if;
  if p_photo_path is not null and p_photo_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'invalid_photo';
  end if;
  p_details := coalesce(p_details, '{}'::jsonb);
  if jsonb_typeof(p_details) <> 'object' then raise exception 'invalid_details'; end if;
  perform community_validate_details(p_category, p_details);

  insert into community_points (category, title, description, lat, lng, photo_path, details, author_id,
                                observed_at, last_confirmed_at, last_confirmed_by, expires_at)
    values (p_category, p_title, p_description, p_lat, p_lng, p_photo_path, p_details, auth.uid(),
            v_observed, now(), auth.uid(), now() + make_interval(days => v_show))
    returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function community_add_point(text, text, text, double precision, double precision, timestamptz, text, jsonb) from public, anon;
grant execute on function community_add_point(text, text, text, double precision, double precision, timestamptz, text, jsonb) to authenticated;

-- «Ισχύει ακόμα»: ανανεώνει την τελευταία επιβεβαίωση (όχι την παρατήρηση).
create or replace function community_confirm_point(p_point_id uuid)
returns community_points
language plpgsql security definer set search_path = public as $$
declare
  v_row community_points%rowtype;
  v_show int;
begin
  perform community_assert_write();
  select * into v_row from community_points where id = p_point_id for update;
  if not found or v_row.status = 'removed' then raise exception 'point_not_found'; end if;
  if v_row.status = 'archived' then raise exception 'point_archived'; end if;
  select show_days into v_show from community_category_settings where category = v_row.category;
  update community_points
     set last_confirmed_at = now(), last_confirmed_by = auth.uid(), expires_at = now() + make_interval(days => v_show)
   where id = p_point_id returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function community_confirm_point(uuid) from public, anon;
grant execute on function community_confirm_point(uuid) to authenticated;

-- Αφαίρεση: ο συντάκτης (και μόνο αν δεν είναι περιορισμένος) ή η διαχείριση.
create or replace function community_remove_point(p_point_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_row community_points%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_row from community_points where id = p_point_id for update;
  if not found or v_row.status = 'removed' then raise exception 'point_not_found'; end if;
  if is_admin() then
    insert into admin_actions (admin_id, action_type, target_user_id, notes)
      values (auth.uid(), 'community_remove_point', v_row.author_id, left(coalesce(p_reason, ''), 300));
  elsif v_row.author_id = auth.uid() and community_eligible(auth.uid()) then
    null;
  else
    raise exception 'not_allowed';
  end if;
  update community_points
     set status = 'removed', removed_at = now(), removed_by = auth.uid(), removed_reason = left(p_reason, 300)
   where id = p_point_id;
  update community_reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
   where point_id = p_point_id and status = 'open';
end;
$$;
revoke execute on function community_remove_point(uuid, text) from public, anon;
grant execute on function community_remove_point(uuid, text) to authenticated;

-- Λίστα σημείων. scope 'visible' (προεπιλογή): ενεργά και μη ληγμένα, για κάθε
-- επιλέξιμο. 'mine': όλα τα δικά μου, και ληγμένα/αρχειοθετημένα. 'all': διαχείριση.
create or replace function community_list_points(
  p_category text default null,
  p_min_lat double precision default null, p_min_lng double precision default null,
  p_max_lat double precision default null, p_max_lng double precision default null,
  p_scope text default 'visible', p_limit int default 200
) returns table (
  id uuid, category text, title text, description text, lat double precision, lng double precision,
  photo_path text, details jsonb, author_id uuid, author_name text, observed_at timestamptz,
  last_confirmed_at timestamptz, expires_at timestamptz, status text, is_expired boolean, created_at timestamptz,
  open_reports int
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform community_assert_read();
  if p_scope not in ('visible', 'mine', 'all') then raise exception 'invalid_scope'; end if;
  if p_scope = 'all' and not is_admin() then raise exception 'not_admin'; end if;
  return query
    select p.id, p.category, p.title, p.description, p.lat, p.lng, p.photo_path, p.details, p.author_id,
           community_author_name(p.author_id), p.observed_at, p.last_confirmed_at, p.expires_at, p.status,
           (p.expires_at <= now()),
           p.created_at,
           case when is_admin() then (select count(*)::int from community_reports r where r.point_id = p.id and r.status = 'open') else 0 end
      from community_points p
     where (p_category is null or p.category = p_category)
       and (p_min_lat is null or p.lat >= p_min_lat) and (p_max_lat is null or p.lat <= p_max_lat)
       and (p_min_lng is null or p.lng >= p_min_lng) and (p_max_lng is null or p.lng <= p_max_lng)
       and case p_scope
             when 'visible' then p.status = 'active' and p.expires_at > now()
             when 'mine' then p.author_id = auth.uid() and p.status <> 'removed'
             else true end
     order by p.last_confirmed_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;
revoke execute on function community_list_points(text, double precision, double precision, double precision, double precision, text, int) from public, anon;
grant execute on function community_list_points(text, double precision, double precision, double precision, double precision, text, int) to authenticated;

-- Αρχειοθέτηση (cron, καθημερινά): περνά σε 'archived' ό,τι ξεπέρασε το όριο
-- αρχειοθέτησης της κατηγορίας του από την τελευταία επιβεβαίωση.
create or replace function community_archive_stale()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update community_points p
     set status = 'archived', archived_at = now()
    from community_category_settings s
   where s.category = p.category and p.status = 'active'
     and p.last_confirmed_at + make_interval(days => s.archive_days) <= now();
  get diagnostics v_count = row_count;
  delete from community_presence where expires_at <= now();
  return v_count;
end;
$$;
revoke execute on function community_archive_stale() from public, anon, authenticated;
grant execute on function community_archive_stale() to service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or current_setting('cron.database_name', true) is distinct from current_database() then
    raise notice 'pg_cron not available in this database — community archive not scheduled';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.schedule('platform-community-archive', '35 3 * * *', 'select public.community_archive_stale()');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Ομάδες και μηνύματα
-- ---------------------------------------------------------------------------
create or replace function community_list_groups()
returns table (id uuid, slug text, name text, name_en text, status text, member_count int, is_member boolean, last_message_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform community_assert_read();
  return query
    select g.id, g.slug, g.name, g.name_en, g.status,
           (select count(*)::int from community_group_members m where m.group_id = g.id),
           exists (select 1 from community_group_members m where m.group_id = g.id and m.user_id = auth.uid()),
           (select max(msg.created_at) from community_messages msg where msg.group_id = g.id and msg.deleted_at is null)
      from community_groups g
     order by g.sort_order, g.name;
end;
$$;
revoke execute on function community_list_groups() from public, anon;
grant execute on function community_list_groups() to authenticated;

create or replace function community_join_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  perform community_assert_write();
  select status into v_status from community_groups where id = p_group_id;
  if not found then raise exception 'group_not_found'; end if;
  if v_status <> 'open' then raise exception 'group_closed'; end if;
  insert into community_group_members (group_id, user_id) values (p_group_id, auth.uid()) on conflict do nothing;
end;
$$;
revoke execute on function community_join_group(uuid) from public, anon;
grant execute on function community_join_group(uuid) to authenticated;

create or replace function community_leave_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from community_group_members where group_id = p_group_id and user_id = auth.uid();
end;
$$;
revoke execute on function community_leave_group(uuid) from public, anon;
grant execute on function community_leave_group(uuid) to authenticated;

create or replace function community_post_message(p_group_id uuid, p_body text, p_parent_id uuid default null)
returns community_messages
language plpgsql security definer set search_path = public as $$
declare
  v_group community_groups%rowtype;
  v_parent community_messages%rowtype;
  v_row community_messages%rowtype;
begin
  perform community_assert_write();
  select * into v_group from community_groups where id = p_group_id;
  if not found then raise exception 'group_not_found'; end if;
  if v_group.status <> 'open' then raise exception 'group_closed'; end if;
  if not exists (select 1 from community_group_members where group_id = p_group_id and user_id = auth.uid()) then
    raise exception 'not_member';
  end if;
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) < 1 or char_length(p_body) > 2000 then raise exception 'invalid_body'; end if;
  if p_parent_id is not null then
    select * into v_parent from community_messages where id = p_parent_id;
    -- Απάντηση σε μήνυμα της ίδιας ομάδας, ένα επίπεδο (όχι απάντηση σε απάντηση).
    if not found or v_parent.group_id <> p_group_id or v_parent.parent_id is not null or v_parent.deleted_at is not null then
      raise exception 'invalid_parent';
    end if;
  end if;
  insert into community_messages (group_id, parent_id, author_id, body)
    values (p_group_id, p_parent_id, auth.uid(), p_body) returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function community_post_message(uuid, text, uuid) from public, anon;
grant execute on function community_post_message(uuid, text, uuid) to authenticated;

-- Τα διαγραμμένα επιστρέφονται χωρίς κείμενο (ώστε να μένουν οι απαντήσεις τους).
create or replace function community_list_messages(p_group_id uuid, p_before timestamptz default null, p_limit int default 50)
returns table (id uuid, parent_id uuid, author_id uuid, author_name text, body text, created_at timestamptz, deleted boolean, open_reports int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform community_assert_read();
  if not exists (select 1 from community_groups g where g.id = p_group_id) then raise exception 'group_not_found'; end if;
  return query
    select m.id, m.parent_id, m.author_id,
           case when m.deleted_at is null then community_author_name(m.author_id) end,
           case when m.deleted_at is null then m.body end,
           m.created_at, m.deleted_at is not null,
           case when is_admin() then (select count(*)::int from community_reports r where r.message_id = m.id and r.status = 'open') else 0 end
      from community_messages m
     where m.group_id = p_group_id and (p_before is null or m.created_at < p_before)
       and (m.deleted_at is null or exists (select 1 from community_messages c where c.parent_id = m.id and c.deleted_at is null))
     order by m.created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
revoke execute on function community_list_messages(uuid, timestamptz, int) from public, anon;
grant execute on function community_list_messages(uuid, timestamptz, int) to authenticated;

create or replace function community_delete_message(p_message_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_row community_messages%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_row from community_messages where id = p_message_id for update;
  if not found or v_row.deleted_at is not null then raise exception 'message_not_found'; end if;
  if is_admin() then
    insert into admin_actions (admin_id, action_type, target_user_id, notes)
      values (auth.uid(), 'community_delete_message', v_row.author_id, left(coalesce(p_reason, ''), 300));
  elsif v_row.author_id <> auth.uid() or not community_eligible(auth.uid()) then
    raise exception 'not_allowed';
  end if;
  update community_messages set deleted_at = now(), deleted_by = auth.uid(), deleted_reason = left(p_reason, 300)
   where id = p_message_id;
  update community_reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
   where message_id = p_message_id and status = 'open';
end;
$$;
revoke execute on function community_delete_message(uuid, text) from public, anon;
grant execute on function community_delete_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Αναφορές προβλήματος
-- ---------------------------------------------------------------------------
create or replace function community_report(p_target_type text, p_target_id uuid, p_reason text, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform community_assert_write();
  if p_target_type not in ('point', 'message') then raise exception 'invalid_target'; end if;
  if p_reason not in ('wrong', 'outdated', 'abuse', 'offer', 'other') then raise exception 'invalid_reason'; end if;
  p_note := btrim(coalesce(p_note, ''));
  if char_length(p_note) > 500 then raise exception 'invalid_note'; end if;
  if p_target_type = 'point' then
    if not exists (select 1 from community_points where id = p_target_id and status <> 'removed') then raise exception 'target_not_found'; end if;
    insert into community_reports (target_type, point_id, reporter_id, reason, note)
      values ('point', p_target_id, auth.uid(), p_reason, p_note)
      on conflict do nothing returning id into v_id;
  else
    if not exists (select 1 from community_messages where id = p_target_id and deleted_at is null) then raise exception 'target_not_found'; end if;
    insert into community_reports (target_type, message_id, reporter_id, reason, note)
      values ('message', p_target_id, auth.uid(), p_reason, p_note)
      on conflict do nothing returning id into v_id;
  end if;
  -- Ήδη ανοιχτή αναφορά του ίδιου μέλους για το ίδιο στοιχείο: δεν διπλογράφεται.
  return v_id;
end;
$$;
revoke execute on function community_report(text, uuid, text, text) from public, anon;
grant execute on function community_report(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Nearby: προαιρετική, προσωρινή κοινοποίηση θέσης
-- ---------------------------------------------------------------------------
create or replace function community_set_presence(p_lat double precision, p_lng double precision, p_hours int default 12)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform community_assert_write();
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_position';
  end if;
  if p_hours is null or p_hours not between 1 and 24 then raise exception 'invalid_duration'; end if;
  insert into community_presence (user_id, lat, lng, updated_at, expires_at)
    values (auth.uid(), p_lat, p_lng, now(), now() + make_interval(hours => p_hours))
    on conflict (user_id) do update
      set lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at, expires_at = excluded.expires_at;
end;
$$;
revoke execute on function community_set_presence(double precision, double precision, int) from public, anon;
grant execute on function community_set_presence(double precision, double precision, int) to authenticated;

create or replace function community_clear_presence()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from community_presence where user_id = auth.uid();
end;
$$;
revoke execute on function community_clear_presence() from public, anon;
grant execute on function community_clear_presence() to authenticated;

-- Επιστρέφει θέση στρογγυλεμένη (~1 χλμ), όχι την ακριβή· μόνο για μέλη που την
-- κοινοποίησαν οι ίδιοι και δεν έχει λήξει· ποτέ τον ίδιο τον καλούντα.
create or replace function community_nearby_members(p_lat double precision, p_lng double precision, p_radius_km double precision default 25)
returns table (user_id uuid, display_name text, crew_role crew_role, distance_km double precision, approx_lat double precision, approx_lng double precision, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform community_assert_write();
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_position';
  end if;
  if p_radius_km is null or p_radius_km <= 0 or p_radius_km > 100 then raise exception 'invalid_radius'; end if;
  return query
    select pr.user_id, community_author_name(pr.user_id), sp.role,
           round(community_distance_km(p_lat, p_lng, pr.lat, pr.lng)::numeric, 1)::double precision,
           round(pr.lat::numeric, 2)::double precision, round(pr.lng::numeric, 2)::double precision, pr.updated_at
      from community_presence pr
      join skipper_profiles sp on sp.user_id = pr.user_id and sp.deleted_at is null
     where pr.expires_at > now() and pr.user_id <> auth.uid()
       and community_eligible(pr.user_id) and not community_restricted(pr.user_id)
       and community_distance_km(p_lat, p_lng, pr.lat, pr.lng) <= p_radius_km
     order by 4
     limit 100;
end;
$$;
revoke execute on function community_nearby_members(double precision, double precision, double precision) from public, anon;
grant execute on function community_nearby_members(double precision, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Διαχείριση: εποπτεία
-- ---------------------------------------------------------------------------
create or replace function admin_community_list_reports(p_status text default 'open')
returns table (id uuid, target_type text, point_id uuid, message_id uuid, reporter_id uuid, reporter_name text, reason text, note text,
               status text, created_at timestamptz, target_author_id uuid, target_author_name text, target_text text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select r.id, r.target_type, r.point_id, r.message_id, r.reporter_id, (select u.full_name from users u where u.id = r.reporter_id),
           r.reason, r.note, r.status, r.created_at,
           coalesce(p.author_id, m.author_id),
           (select u.full_name from users u where u.id = coalesce(p.author_id, m.author_id)),
           coalesce(p.title, m.body)
      from community_reports r
      left join community_points p on p.id = r.point_id
      left join community_messages m on m.id = r.message_id
     where p_status is null or r.status = p_status
     order by r.created_at desc
     limit 200;
end;
$$;
revoke execute on function admin_community_list_reports(text) from public, anon;
grant execute on function admin_community_list_reports(text) to authenticated;

create or replace function admin_community_resolve_report(p_report_id uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update community_reports
     set status = case when p_dismiss then 'dismissed' else 'resolved' end, resolved_by = auth.uid(), resolved_at = now()
   where id = p_report_id and status = 'open';
  if not found then raise exception 'report_not_found'; end if;
end;
$$;
revoke execute on function admin_community_resolve_report(uuid, boolean) from public, anon;
grant execute on function admin_community_resolve_report(uuid, boolean) to authenticated;

create or replace function admin_community_restrict_member(p_user_id uuid, p_days int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_days is null or p_days not between 1 and 365 then raise exception 'invalid_duration'; end if;
  if p_reason not in ('rules', 'offers', 'abuse', 'other') then raise exception 'invalid_reason'; end if;
  perform assert_admin_can_act_on(p_user_id);
  insert into community_restrictions (user_id, until, reason, set_by)
    values (p_user_id, now() + make_interval(days => p_days), p_reason, auth.uid())
    on conflict (user_id) do update set until = excluded.until, reason = excluded.reason, set_by = excluded.set_by, created_at = now();
  delete from community_presence where user_id = p_user_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'community_restrict', p_user_id, p_reason || ' · ' || p_days || 'd');
end;
$$;
revoke execute on function admin_community_restrict_member(uuid, int, text) from public, anon;
grant execute on function admin_community_restrict_member(uuid, int, text) to authenticated;

create or replace function admin_community_lift_restriction(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform assert_admin_can_act_on(p_user_id);
  delete from community_restrictions where user_id = p_user_id;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'community_lift_restriction', p_user_id, '');
end;
$$;
revoke execute on function admin_community_lift_restriction(uuid) from public, anon;
grant execute on function admin_community_lift_restriction(uuid) to authenticated;

create or replace function admin_community_set_group_status(p_group_id uuid, p_closed boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update community_groups
     set status = case when p_closed then 'closed' else 'open' end,
         closed_at = case when p_closed then now() end,
         closed_by = case when p_closed then auth.uid() end,
         closed_reason = case when p_closed then left(p_reason, 300) end
   where id = p_group_id;
  if not found then raise exception 'group_not_found'; end if;
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), case when p_closed then 'community_close_group' else 'community_reopen_group' end, null,
            (select slug from community_groups where id = p_group_id));
end;
$$;
revoke execute on function admin_community_set_group_status(uuid, boolean, text) from public, anon;
grant execute on function admin_community_set_group_status(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Διαχείριση: ρυθμίσεις ανά κατηγορία (μόνο ιδιοκτήτης)
-- ---------------------------------------------------------------------------
create or replace function admin_community_list_settings()
returns setof community_category_settings language sql stable security definer set search_path = public as $$
  select * from community_category_settings where is_admin() order by category;
$$;
revoke execute on function admin_community_list_settings() from public, anon;
grant execute on function admin_community_list_settings() to authenticated;

create or replace function admin_community_set_category(p_category text, p_show_days int, p_archive_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  if p_show_days is null or p_archive_days is null or p_show_days < 1 or p_archive_days < p_show_days or p_archive_days > 3650 then
    raise exception 'invalid_days';
  end if;
  update community_category_settings set show_days = p_show_days, archive_days = p_archive_days, updated_at = now()
   where category = p_category;
  if not found then raise exception 'invalid_category'; end if;
  -- Τα ενεργά σημεία παίρνουν αμέσως τη νέα διάρκεια εμφάνισης.
  update community_points set expires_at = last_confirmed_at + make_interval(days => p_show_days)
   where category = p_category and status = 'active';
  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'community_set_category', null, p_category || ' · ' || p_show_days || '/' || p_archive_days);
end;
$$;
revoke execute on function admin_community_set_category(text, int, int) from public, anon;
grant execute on function admin_community_set_category(text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Φωτογραφίες σημείων: ιδιωτικός χώρος, ορατός μόνο στα μέλη
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('community-photos', 'community-photos', false)
on conflict (id) do nothing;

do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
      set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'], file_size_limit = 5242880
      where id = 'community-photos'$q$;
  end if;
end $$;

drop policy if exists "community photos member read" on storage.objects;
create policy "community photos member read" on storage.objects for select to authenticated
  using (bucket_id = 'community-photos' and (community_eligible(auth.uid()) or is_admin()));

drop policy if exists "community photos member insert" on storage.objects;
create policy "community photos member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'community-photos' and (storage.foldername(name))[1] = auth.uid()::text
              and community_eligible(auth.uid()) and not community_restricted(auth.uid()));

drop policy if exists "community photos owner delete" on storage.objects;
create policy "community photos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'community-photos' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
