-- ============================================================================
-- Υποδομή γλωσσών (0123, docs/I18N.md).
--
-- 1. Η γλώσσα του λογαριασμού (users.locale): την γράφει το κουμπί γλώσσας όταν
--    ο χρήστης είναι συνδεδεμένος· τη διαβάζουν τα emails και κάθε συσκευή που
--    συνδέεται. Δεν υπάρχει λίστα γλωσσών εδώ: μόνο η μορφή του κωδικού (el, en,
--    pt-BR…). Ποιες γλώσσες είναι ανοιχτές το ορίζει το lib/platform/i18n.js, άρα
--    νέα γλώσσα δεν θέλει ποτέ νέα μετάβαση.
-- 2. Λατινική γραφή ονομάτων (full_name_latin) με το πρότυπο των διαβατηρίων
--    (ΕΛΟΤ 743): «Γιώργος Παπαδόπουλος» → «Giorgos Papadopoulos». Παράγωγη από το
--    όνομα, ποτέ δική του: την υπολογίζει η βάση σε κάθε αλλαγή ονόματος, όποια
--    κι αν είναι η διαδρομή εγγραφής (τηλέφωνο, Google, διαχείριση).
--    Την ίδια μετατροπή κάνει και το lib/platform/translit.js· και οι δύο
--    δοκιμάζονται με τα ίδια παραδείγματα (tests/fixtures/translit.json).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Γλώσσα λογαριασμού
-- ---------------------------------------------------------------------------
alter table users add column if not exists locale text not null default 'el';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_locale_format') then
    alter table users add constraint users_locale_format check (locale ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$');
  end if;
end;
$$;

create or replace function set_my_locale(p_locale text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_locale is null or p_locale !~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$' then raise exception 'invalid_locale'; end if;
  perform set_config('platform.trusted', 'true', true);
  update users set locale = p_locale where id = auth.uid() and locale is distinct from p_locale;
end;
$$;
revoke execute on function set_my_locale(text) from public, anon;
grant execute on function set_my_locale(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ελληνικά → λατινικά (ΕΛΟΤ 743, τύπος 2)
-- ---------------------------------------------------------------------------
create or replace function greek_to_latin_case(p_out text, p_src_upper boolean, p_all_upper boolean)
returns text language sql immutable as $$
  select case when not p_src_upper then p_out
              when p_all_upper then upper(p_out)
              else upper(left(p_out, 1)) || substr(p_out, 2) end
$$;

create or replace function greek_to_latin(p_text text)
returns text language plpgsql immutable as $$
declare
  c_greek constant text := '[\u0370-\u03FF\u1F00-\u1FFF]';
  c_accent constant text := '[\u0300\u0301\u0342\u0313\u0314]';
  v_map constant jsonb := '{"α":"a","β":"v","γ":"g","δ":"d","ε":"e","ζ":"z","η":"i","θ":"th","ι":"i","κ":"k","λ":"l","μ":"m","ν":"n","ξ":"x","ο":"o","π":"p","ρ":"r","σ":"s","ς":"s","τ":"t","υ":"y","φ":"f","χ":"ch","ψ":"ps","ω":"o"}';
  v_norm text := normalize(coalesce(p_text, ''), nfd);
  v_base text[] := '{}';
  v_marks text[] := '{}';
  v_tok text[];
  v_n int;
  i int;
  v_out text := '';
  c text;
  nx text;
  af text;
  up boolean;
  nup boolean;
  next_ok boolean;
  after_ok boolean;
  prev_ok boolean;
  mapped text;
  v_end text;
begin
  for v_tok in select regexp_matches(v_norm, '([^\u0300-\u036F])([\u0300-\u036F]*)', 'g') loop
    v_base := v_base || v_tok[1];
    v_marks := v_marks || v_tok[2];
  end loop;
  v_n := coalesce(array_length(v_base, 1), 0);

  i := 1;
  while i <= v_n loop
    if v_base[i] !~ c_greek then
      v_out := v_out || normalize(v_base[i] || v_marks[i], nfc);
      i := i + 1;
      continue;
    end if;
    c := lower(v_base[i]);
    up := v_base[i] <> c;
    next_ok := i + 1 <= v_n and v_base[i + 1] ~ c_greek;
    after_ok := i + 2 <= v_n and v_base[i + 2] ~ c_greek;
    prev_ok := i > 1 and v_base[i - 1] ~ c_greek;
    nx := case when next_ok then lower(v_base[i + 1]) end;
    af := case when after_ok then lower(v_base[i + 2]) end;
    nup := next_ok and v_base[i + 1] <> lower(v_base[i + 1]);

    -- αυ ευ ηυ: v πριν από φωνήεν ή ηχηρό, f πριν από άηχο ή στο τέλος, y με τόνο/διαλυτικά
    if c in ('α', 'ε', 'η') and nx = 'υ' then
      if v_marks[i] ~ c_accent or v_marks[i + 1] like '%' || chr(776) || '%' then v_end := 'y';
      elsif not after_ok or af in ('θ', 'κ', 'ξ', 'π', 'σ', 'ς', 'τ', 'φ', 'χ', 'ψ') then v_end := 'f';
      else v_end := 'v';
      end if;
      v_out := v_out || greek_to_latin_case((v_map ->> c) || v_end, up, nup);
      i := i + 2;
      continue;
    end if;
    -- ου
    if c = 'ο' and nx = 'υ' then
      v_out := v_out || greek_to_latin_case('ou', up, nup);
      i := i + 2;
      continue;
    end if;
    -- γγ γξ γχ: το πρώτο γ είναι n
    if c = 'γ' and nx in ('γ', 'ξ', 'χ') then
      v_out := v_out || greek_to_latin_case('n', up, false);
      i := i + 1;
      continue;
    end if;
    -- μπ: b στην αρχή ή στο τέλος της λέξης, αλλιώς mp
    if c = 'μ' and nx = 'π' and (not prev_ok or not after_ok) then
      v_out := v_out || greek_to_latin_case('b', up, false);
      i := i + 2;
      continue;
    end if;

    mapped := v_map ->> c;
    if mapped is null then
      v_out := v_out || normalize(v_base[i] || v_marks[i], nfc);
    else
      v_out := v_out || greek_to_latin_case(mapped, up, length(mapped) > 1 and nup);
    end if;
    i := i + 1;
  end loop;
  return v_out;
end;
$$;
grant execute on function greek_to_latin(text) to anon, authenticated;
revoke execute on function greek_to_latin_case(text, boolean, boolean) from public;
grant execute on function greek_to_latin_case(text, boolean, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Το λατινικό όνομα: παράγωγο, σε κάθε αλλαγή ονόματος
-- ---------------------------------------------------------------------------
alter table users add column if not exists full_name_latin text;
alter table skipper_profiles add column if not exists full_name_latin text;

create or replace function set_full_name_latin()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT'
     or new.full_name is distinct from old.full_name
     or new.full_name_latin is distinct from old.full_name_latin then
    new.full_name_latin := case
      when new.full_name ~ '[\u0370-\u03FF\u1F00-\u1FFF]' then greek_to_latin(new.full_name)
      else new.full_name end;
  end if;
  return new;
end;
$$;

-- Τελευταίος στη σειρά: τρέχει αφού οι φύλακες έχουν κρίνει το τελικό όνομα.
drop trigger if exists zz_full_name_latin on users;
create trigger zz_full_name_latin before insert or update on users
  for each row execute function set_full_name_latin();
drop trigger if exists zz_full_name_latin on skipper_profiles;
create trigger zz_full_name_latin before insert or update on skipper_profiles
  for each row execute function set_full_name_latin();

-- Όσα ονόματα υπάρχουν ήδη.
do $$
begin
  perform set_config('platform.trusted', 'true', true);
  update users set full_name_latin = case
      when full_name ~ '[\u0370-\u03FF\u1F00-\u1FFF]' then greek_to_latin(full_name) else full_name end
    where full_name is not null and full_name_latin is null;
  update skipper_profiles set full_name_latin = case
      when full_name ~ '[\u0370-\u03FF\u1F00-\u1FFF]' then greek_to_latin(full_name) else full_name end
    where full_name is not null and full_name_latin is null;
end;
$$;
