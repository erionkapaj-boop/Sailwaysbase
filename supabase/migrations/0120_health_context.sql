-- ============================================================================
-- Υγεία εφαρμογής: αρκετά στοιχεία για να διορθώνεται ένα σφάλμα, όχι μόνο
-- για να φαίνεται ότι υπάρχει (docs/HEALTH.md).
--
-- Κάθε αναφορά από τον browser φέρνει πλέον και ένα μικρό «πλαίσιο»:
--   v   έκδοση της εφαρμογής (το deploy)
--   d   συσκευή και browser σε γενική μορφή («Android · Chrome»)
--   va  αν ο ιδιοκτήτης έβλεπε «ως χρήστης»
--   t   τα τελευταία βήματα («άνοιξε /platform/requests», «πάτησε «Αποδοχή»»,
--       «claim_booking_request → insufficient_wallet»)
-- Η βάση κρατά ΜΟΝΟ αυτά τα πεδία, κομμένα, χωρίς email, αριθμούς και ids,
-- ό,τι κι αν στείλει ο browser.
--
-- Νέα είδη:
--   rpc     αποτυχία ενέργειας στη βάση που δεν είναι αναμενόμενη απάντηση
--           (π.χ. δικαιώματα, χαμένη συνάρτηση, σφάλμα σύνδεσης)
--   server  σφάλμα σε λειτουργία του διακομιστή (εγγραφή, αλλαγή τηλεφώνου,
--           νυχτερινές εργασίες). Μόνο ο διακομιστής μπορεί να το στείλει.
-- ============================================================================

alter table health_events add column if not exists context jsonb;

-- Ελεύθερο κείμενο → χωρίς email, ids και αριθμούς 7+ ψηφίων (τηλέφωνα κ.λπ.),
-- κομμένο. Οι κωδικοί σφάλματος της βάσης (5 ψηφία, π.χ. 42501) μένουν.
create or replace function health_clean_text(p text, p_len int) returns text
language sql immutable as $$
  select nullif(left(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''), '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
        '[^[:space:]@]+@[^[:space:]@]+', '[email]', 'g'),
      '\+?[0-9][0-9 .-]{5,}[0-9]', '[αριθμός]', 'g')
  ), p_len), '')
$$;

-- Κρατά μόνο τα γνωστά πεδία· όλα τα άλλα πετιούνται.
create or replace function health_clean_context(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  v_trail jsonb := '[]'::jsonb;
  v_item jsonb;
  v_n int := 0;
  v_out jsonb := '{}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return null; end if;
  if jsonb_typeof(p->'v') = 'string' then
    v_out := v_out || jsonb_build_object('v', left(regexp_replace(p->>'v', '[^A-Za-z0-9._-]', '', 'g'), 20));
  end if;
  if jsonb_typeof(p->'d') = 'string' then
    v_out := v_out || jsonb_build_object('d', health_clean_text(p->>'d', 40));
  end if;
  if jsonb_typeof(p->'va') = 'boolean' then
    v_out := v_out || jsonb_build_object('va', (p->>'va')::boolean);
  end if;
  if jsonb_typeof(p->'t') = 'array' then
    for v_item in select value from jsonb_array_elements(p->'t') loop
      exit when v_n >= 8;
      if jsonb_typeof(v_item) = 'string' and health_clean_text(v_item #>> '{}', 90) is not null then
        v_trail := v_trail || to_jsonb(health_clean_text(v_item #>> '{}', 90));
        v_n := v_n + 1;
      end if;
    end loop;
    if v_n > 0 then v_out := v_out || jsonb_build_object('t', v_trail); end if;
  end if;
  return nullif(jsonb_strip_nulls(v_out), '{}'::jsonb);
end;
$$;

-- Η παλιά μορφή (4 ορίσματα) φεύγει: η νέα έχει το πλαίσιο προαιρετικό, οπότε
-- όσοι browser έχουν ακόμα την παλιά έκδοση συνεχίζουν να δουλεύουν.
drop function if exists report_app_issue(text, text, text, text);

create or replace function report_app_issue(p_kind text, p_code text, p_page text, p_detail text, p_context jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_kind text := case when p_kind in ('error', 'crash', 'stuck', 'rpc') then p_kind else 'error' end;
  v_code text := nullif(left(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9_.:-]', '', 'g'), 80), '');
  v_page text;
  v_detail text;
  v_ctx jsonb := health_clean_context(p_context);
  v_fp text;
  v_title text;
begin
  v_code := coalesce(v_code, 'unexpected');
  v_page := regexp_replace(coalesce(p_page, ''), '\?.*$', '');
  v_page := regexp_replace(v_page, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g');
  v_page := nullif(left(regexp_replace(v_page, '[^A-Za-z0-9/_:.-]', '', 'g'), 120), '');
  v_detail := left(coalesce(p_detail, ''), 300);
  v_detail := regexp_replace(v_detail, '[^[:space:]@]+@[^[:space:]@]+', '[email]', 'g');
  v_detail := regexp_replace(v_detail, '\+?[0-9][0-9 ]{5,}[0-9]', '[αριθμός]', 'g');
  v_fp := 'app:' || v_kind || ':' || v_code || '@' || coalesce(v_page, '-');

  -- Όρια: ένας χρήστης δεν γεμίζει τον πίνακα, ούτε οι ανώνυμοι συνολικά.
  if v_uid is not null then
    if (select count(*) from health_events where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then return; end if;
    if exists (select 1 from health_events where user_id = v_uid and fingerprint = v_fp
                and created_at > now() - interval '1 minute') then return; end if;
  else
    if (select count(*) from health_events where user_id is null and created_at > now() - interval '1 hour') >= 300 then return; end if;
  end if;

  insert into health_events (fingerprint, user_id, page, detail, context)
    values (v_fp, v_uid, v_page, nullif(v_detail, ''), v_ctx);

  v_title := case
    when v_kind = 'crash' then 'Η σελίδα έσπασε'
    when v_kind = 'rpc' then 'Αποτυχία ενέργειας στη βάση'
    when v_kind = 'stuck' and v_code = 'pingpong' then 'Χρήστες πηγαινοέρχονται ανάμεσα σε δύο σελίδες'
    when v_kind = 'stuck' and v_code = 'reload_loop' then 'Χρήστες ξαναφορτώνουν τη σελίδα ξανά και ξανά'
    when v_kind = 'stuck' then 'Χρήστες κολλάνε: ίδια αποτυχία ξανά και ξανά'
    else 'Απρόβλεπτο σφάλμα' end;
  perform health_touch(v_fp, 'app', v_code, v_title, v_page, 1,
    (select count(distinct user_id)::int from health_events where fingerprint = v_fp and created_at > now() - interval '90 days'),
    jsonb_strip_nulls(jsonb_build_object('detail', nullif(v_detail, ''), 'context', v_ctx)), true);
end;
$$;
revoke execute on function report_app_issue(text, text, text, text, jsonb) from public;
grant execute on function report_app_issue(text, text, text, text, jsonb) to anon, authenticated;

-- Σφάλματα του διακομιστή (instrumentation.js, API routes, cron). Μόνο με το
-- κλειδί του διακομιστή· ο browser δεν μπορεί να γράψει εδώ.
create or replace function report_server_issue(p_code text, p_route text, p_detail text, p_context jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_code text := coalesce(nullif(left(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9_.:-]', '', 'g'), 80), ''), 'unexpected');
  v_route text := nullif(left(regexp_replace(
    regexp_replace(regexp_replace(coalesce(p_route, ''), '\?.*$', ''),
      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
    '[^A-Za-z0-9/_:.\[\]-]', '', 'g'), 120), '');
  v_detail text := health_clean_text(p_detail, 300);
  v_ctx jsonb := health_clean_context(p_context);
  v_fp text := 'app:server:' || v_code || '@' || coalesce(v_route, '-');
begin
  -- Ίδιο σφάλμα: μία καταγραφή το λεπτό· συνολικό ταβάνι ανά ώρα.
  if exists (select 1 from health_events where fingerprint = v_fp and created_at > now() - interval '1 minute') then return; end if;
  if (select count(*) from health_events where fingerprint like 'app:server:%' and created_at > now() - interval '1 hour') >= 200 then return; end if;

  insert into health_events (fingerprint, user_id, page, detail, context) values (v_fp, null, v_route, v_detail, v_ctx);
  perform health_touch(v_fp, 'app', v_code, 'Σφάλμα διακομιστή', v_route, 1, 0,
    jsonb_strip_nulls(jsonb_build_object('detail', v_detail, 'context', v_ctx)), true);
end;
$$;
revoke execute on function report_server_issue(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function report_server_issue(text, text, text, jsonb) to service_role;

-- Για τον ιδιοκτήτη: τα τελευταία γεγονότα ενός θέματος, με το πλαίσιό τους
-- (όχι μόνο το πιο πρόσφατο δείγμα). Χωρίς χρήστη.
create or replace function admin_health_events(p_fingerprint text, p_limit int default 5)
returns table (created_at timestamptz, page text, detail text, context jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner_admin() then raise exception 'owner_only'; end if;
  return query
    select e.created_at, e.page, e.detail, e.context
      from health_events e
     where e.fingerprint = p_fingerprint
     order by e.created_at desc
     limit least(greatest(coalesce(p_limit, 5), 1), 20);
end;
$$;
revoke execute on function admin_health_events(text, int) from public, anon;
grant execute on function admin_health_events(text, int) to authenticated;
