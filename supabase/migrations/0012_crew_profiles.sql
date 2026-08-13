-- ============================================================================
-- Crew profile generalisation (crew-profile-page-plan-v1).
--
-- The profiles table now serves all four crew roles, not just skippers.
--
-- ON THE TABLE NAME: the plan asks for skipper_profiles → crew_profiles.
-- That rename is deliberately NOT done here. Roughly twenty plpgsql
-- functions reference the table by name (claim_booking_request,
-- cancel_booking, the tier/rating/flag triggers, the admin approvals,
-- search_available_skippers, the RLS helpers), and Postgres does not rewrite
-- function bodies on rename — every one of them would break at runtime while
-- looking perfectly fine at migration time. It's worth doing on its own,
-- with each function reissued and verified, rather than riding along with a
-- feature change. The table name is invisible to users either way.
-- ============================================================================

do $$ begin
  create type crew_role as enum ('skipper', 'hostess', 'cook', 'deckhand');
exception when duplicate_object then null;
end $$;

-- Existing rows are all skippers by definition — that's all the platform
-- supported until now.
alter table skipper_profiles add column if not exists role crew_role not null default 'skipper';

-- Licence is no longer shown, collected, or used as an identifier (phone took
-- that job in 0011). The columns stay for the historical merge path in
-- admin_approve_skipper, but nothing in the UI touches them any more.

-- Self-selected bio tags are replaced by highlights computed from real data,
-- so there is nothing left for a user to write about themselves — which also
-- removes the last place contact details could be smuggled into an anonymous
-- profile.
--
-- admin_approve_skipper copies bio when merging a returning professional's
-- history, so it has to be reissued *before* the column goes or the next
-- approval fails.
create or replace function admin_approve_skipper(p_user_id uuid) returns skipper_profiles
language plpgsql security definer set search_path = public as $$
declare v_new skipper_profiles%rowtype; v_existing skipper_profiles%rowtype;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  select * into v_new from skipper_profiles where user_id = p_user_id;
  if not found then raise exception 'profile_not_found'; end if;

  -- Licence is optional now, so only attempt the historical merge when one
  -- was actually supplied; otherwise every licence-less profile would match
  -- every other licence-less profile on NULL.
  if v_new.license_number is not null and btrim(v_new.license_number) <> '' then
    select * into v_existing from skipper_profiles
      where license_number = v_new.license_number and id <> v_new.id
      limit 1;
  end if;

  if found and v_existing.id is not null then
    delete from skipper_languages a using skipper_languages b
      where a.skipper_id = v_new.id and b.skipper_id = v_existing.id and a.language_id = b.language_id;
    update skipper_languages set skipper_id = v_existing.id where skipper_id = v_new.id;

    delete from skipper_boat_types a using skipper_boat_types b
      where a.skipper_id = v_new.id and b.skipper_id = v_existing.id and a.boat_type_id = b.boat_type_id;
    update skipper_boat_types set skipper_id = v_existing.id where skipper_id = v_new.id;

    delete from skipper_coverage_areas a using skipper_coverage_areas b
      where a.skipper_id = v_new.id and b.skipper_id = v_existing.id and a.port_id = b.port_id;
    update skipper_coverage_areas set skipper_id = v_existing.id where skipper_id = v_new.id;

    update skipper_availability set skipper_id = v_existing.id where skipper_id = v_new.id;

    delete from skipper_profiles where id = v_new.id;

    update skipper_profiles set
      user_id = p_user_id,
      full_name = v_new.full_name,
      role = v_new.role,
      photo_url = coalesce(v_new.photo_url, photo_url),
      gender = coalesce(v_new.gender, gender),
      years_experience = greatest(v_new.years_experience, years_experience),
      price_per_day = v_new.price_per_day,
      approval_status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      deleted_at = null
    where id = v_existing.id
    returning * into v_existing;

    insert into admin_actions (admin_id, action_type, target_user_id, notes)
      values (auth.uid(), 'approve_skipper', p_user_id, 'restored history from prior profile ' || v_existing.id);

    return v_existing;
  end if;

  update skipper_profiles set approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = v_new.id
    returning * into v_new;

  insert into admin_actions (admin_id, action_type, target_user_id, notes)
    values (auth.uid(), 'approve_skipper', p_user_id, 'new profile');

  return v_new;
end;
$$;

alter table skipper_profiles drop column if exists bio;

-- The profile form can now write to this table, so `role` joins the list of
-- columns a user may not set for themselves — otherwise a hostess could
-- promote their own profile to skipper and appear in skipper searches.
create or replace function guard_skipper_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('platform.trusted', true), '') = 'true' or is_admin() or auth.uid() is null then
    return new;
  end if;
  new.role := old.role;
  new.approval_status := old.approval_status;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.wallet_balance := old.wallet_balance;
  new.tier := old.tier;
  new.rating_avg := old.rating_avg;
  new.rating_count := old.rating_count;
  new.completed_bookings_count := old.completed_bookings_count;
  new.cancellation_flag_count := old.cancellation_flag_count;
  new.user_id := old.user_id;
  new.deleted_at := old.deleted_at;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Photo storage. Real uploads instead of a URL field.
--
-- Public read: profile photos appear in anonymous search results, so they
-- must be fetchable without a session. Writes are restricted to each user's
-- own folder (<uid>/...), so nobody can overwrite another crew member's
-- photo.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('crew-photos', 'crew-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "crew photos public read" on storage.objects;
create policy "crew photos public read" on storage.objects for select
  using (bucket_id = 'crew-photos');

drop policy if exists "crew photos owner insert" on storage.objects;
create policy "crew photos owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'crew-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "crew photos owner update" on storage.objects;
create policy "crew photos owner update" on storage.objects for update to authenticated
  using (bucket_id = 'crew-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "crew photos owner delete" on storage.objects;
create policy "crew photos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'crew-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- The anonymous search view drops bio and carries role instead, so results can
-- eventually be filtered by what the client is actually looking for.
-- ----------------------------------------------------------------------------
drop view if exists skipper_public;
create view skipper_public as
  select id, role, photo_url, gender, years_experience, license_type, price_per_day,
         rating_avg, rating_count, reliability_percentage, tier
  from skipper_profiles
  where approval_status = 'approved' and deleted_at is null;
grant select on skipper_public to anon, authenticated;

-- search_available_skippers returns setof skipper_public, so it has to be
-- reissued after the view is replaced or it keeps the old column list.
create or replace function search_available_skippers(
  p_start date,
  p_end date,
  p_port_id uuid,
  p_boat_type_id uuid,
  p_max_price numeric default null,
  p_gender text default null
) returns setof skipper_public
language sql stable as $$
  select sp.* from skipper_public sp
  where exists (
      select 1 from skipper_coverage_areas ca where ca.skipper_id = sp.id and ca.port_id = p_port_id
    )
    and exists (
      select 1 from skipper_boat_types bt where bt.skipper_id = sp.id and bt.boat_type_id = p_boat_type_id
    )
    and not exists (
      select 1 from skipper_availability a
      where a.skipper_id = sp.id
        and daterange(a.start_date, a.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and not exists (
      select 1 from bookings b
      where b.skipper_id = sp.id
        and b.status in ('confirmed', 'completed')
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start, p_end, '[]')
    )
    and (p_max_price is null or sp.price_per_day <= p_max_price)
    and (p_gender is null or sp.gender = p_gender)
  order by case sp.tier when 'high' then 0 when 'medium' then 1 else 2 end,
           sp.rating_avg desc nulls last;
$$;
grant execute on function search_available_skippers to anon, authenticated;
