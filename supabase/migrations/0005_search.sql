-- Search + booking-request defaults.

create or replace function set_booking_request_defaults() returns trigger
language plpgsql as $$
begin
  if new.fee_amount is null then
    select value into new.fee_amount from platform_settings where key = 'client_request_fee';
  end if;
  if new.expires_at is null then
    new.expires_at := now() + (select value from platform_settings where key = 'unclaimed_expiry_hours') * interval '1 hour';
  end if;
  return new;
end;
$$;
create trigger trg_booking_request_defaults
  before insert on booking_requests
  for each row execute function set_booking_request_defaults();

-- §5: skippers available for the *entire* requested range, covering the
-- requested port and boat type, matching optional price/gender filters,
-- ordered by tier (then rating) so higher tiers surface first (§5/§6).
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
