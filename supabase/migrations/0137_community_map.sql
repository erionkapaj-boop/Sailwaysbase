-- ============================================================================
-- Community, βήμα 2: ο κοινός χάρτης (απόφαση ιδιοκτήτη 17/10/2026).
--
-- Συμπλήρωμα του 0136 για τον χάρτη:
--   1. community_update_point: ο συντάκτης διορθώνει τη δική του καταχώριση
--      (τίτλο, περιγραφή, θέση, φωτογραφία). Οι ημερομηνίες παρατήρησης και
--      επιβεβαίωσης δεν αλλάζουν με διόρθωση: μόνο το «Ισχύει ακόμη» ανανεώνει
--      την επιβεβαίωση.
--   2. community_category_info: οι διάρκειες εμφάνισης/αρχειοθέτησης ανά
--      κατηγορία για τα μέλη (μόνο ανάγνωση), ώστε ο χάρτης να δείχνει
--      πόσο «φρέσκια» είναι κάθε αναφορά. Οι ρυθμίσεις αλλάζουν μόνο από τη
--      διαχείριση (admin_community_set_category, 0136).
-- ============================================================================

create or replace function community_update_point(
  p_point_id uuid, p_title text, p_description text, p_lat double precision, p_lng double precision,
  p_photo_path text default null, p_remove_photo boolean default false
) returns community_points
language plpgsql security definer set search_path = public as $$
declare
  v_row community_points%rowtype;
begin
  perform community_assert_write();
  select * into v_row from community_points where id = p_point_id for update;
  if not found or v_row.status = 'removed' then raise exception 'point_not_found'; end if;
  if v_row.author_id <> auth.uid() then raise exception 'not_allowed'; end if;
  if v_row.status = 'archived' then raise exception 'point_archived'; end if;
  p_title := btrim(coalesce(p_title, ''));
  p_description := btrim(coalesce(p_description, ''));
  if char_length(p_title) < 3 or char_length(p_title) > 80 then raise exception 'invalid_title'; end if;
  if char_length(p_description) > 1000 then raise exception 'invalid_description'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_position';
  end if;
  if p_photo_path is not null and p_photo_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'invalid_photo';
  end if;
  update community_points
     set title = p_title, description = p_description, lat = p_lat, lng = p_lng,
         photo_path = case when p_remove_photo then null else coalesce(p_photo_path, photo_path) end
   where id = p_point_id returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function community_update_point(uuid, text, text, double precision, double precision, text, boolean) from public, anon;
grant execute on function community_update_point(uuid, text, text, double precision, double precision, text, boolean) to authenticated;

create or replace function community_category_info()
returns table (category text, show_days int, archive_days int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform community_assert_read();
  return query select s.category, s.show_days, s.archive_days from community_category_settings s order by s.category;
end;
$$;
revoke execute on function community_category_info() from public, anon;
grant execute on function community_category_info() to authenticated;
