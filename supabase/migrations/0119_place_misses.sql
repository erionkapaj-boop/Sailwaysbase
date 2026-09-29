-- ============================================================================
-- Μέρη που έψαξαν πελάτες και δεν βρέθηκαν.
--
-- Το πεδίο «Από πού ξεκινά το ταξίδι;» βρίσκει μέρη από ένα λεξικό (νησιά,
-- πόλεις, λιμάνια) με ανοχή σε λάθη γραφής. Όταν κάτι δεν βρίσκεται, ο
-- πελάτης δεν κολλάει: διαλέγει περιοχή και συνεχίζει με ό,τι έγραψε. Αυτό
-- που έγραψε καταγράφεται εδώ, ώστε ο ιδιοκτήτης να βλέπει τι λείπει από το
-- λεξικό (ή πού ψάχνουν πελάτες εκτός των περιοχών μας).
--
-- Μόνο το κείμενο της αναζήτησης (χωρίς αριθμούς/email) και η περιοχή που
-- διάλεξε· χωρίς χρήστη. Διατήρηση 180 ημέρες.
-- ============================================================================

create table if not exists place_search_misses (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  query text not null,
  region_id uuid references regions(id) on delete set null,
  session_id text
);
create index if not exists place_search_misses_created on place_search_misses (created_at);
alter table place_search_misses enable row level security;
revoke all on place_search_misses from public, anon, authenticated;

-- Ίδιο κείμενο με ή χωρίς τόνους/κεφαλαία = ίδιο (Μαρμαρίς = μαρμαρις).
create or replace function place_miss_key(p text) returns text
language sql immutable as $$
  select lower(translate(coalesce(p, ''), 'άέήίόύώϊϋΐΰΆΈΉΊΌΎΏΪΫς', 'αεηιουωιυιυαεηιουωιυσ'))
$$;

create or replace function log_place_miss(p_query text, p_region_id uuid, p_session text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_q text := btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'));
  v_session text := left(regexp_replace(coalesce(p_session, ''), '[^A-Za-z0-9-]', '', 'g'), 40);
begin
  v_q := regexp_replace(v_q, '[^[:space:]@]+@[^[:space:]@]+', '', 'g');
  v_q := btrim(regexp_replace(v_q, '[0-9]{4,}', '', 'g'));
  v_q := left(v_q, 60);
  if char_length(v_q) < 2 then return; end if;
  if p_region_id is not null and not exists (select 1 from regions where id = p_region_id) then return; end if;
  -- Όρια: ίδια επίσκεψη, ίδιο κείμενο μία φορά· λίγες ανά επίσκεψη· συνολικό ταβάνι.
  if length(v_session) >= 8 then
    if exists (select 1 from place_search_misses where session_id = v_session and place_miss_key(query) = place_miss_key(v_q)) then return; end if;
    if (select count(*) from place_search_misses where session_id = v_session and created_at > now() - interval '1 hour') >= 10 then return; end if;
  end if;
  if (select count(*) from place_search_misses where created_at > now() - interval '1 hour') >= 500 then return; end if;
  delete from place_search_misses where created_at < now() - interval '180 days';
  insert into place_search_misses (query, region_id, session_id)
    values (v_q, p_region_id, nullif(v_session, ''));
end;
$$;
revoke execute on function log_place_miss(text, uuid, text) from public;
grant execute on function log_place_miss(text, uuid, text) to anon, authenticated;

-- Για τον ιδιοκτήτη: τι έψαξαν (ομαδοποιημένο), πόσες φορές, και σε ποια
-- περιοχή κατέληξαν.
create or replace function admin_place_misses(p_days int default 30)
returns table (query text, times int, last_at timestamptz, regions text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  return query
    select min(m.query), count(*)::int, max(m.created_at),
           string_agg(distinct r.name, ', ')
      from place_search_misses m
      left join regions r on r.id = m.region_id
     where m.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 180))
     group by place_miss_key(m.query)
     order by count(*) desc, max(m.created_at) desc
     limit 50;
end;
$$;
revoke execute on function admin_place_misses(int) from public, anon;
grant execute on function admin_place_misses(int) to authenticated;
