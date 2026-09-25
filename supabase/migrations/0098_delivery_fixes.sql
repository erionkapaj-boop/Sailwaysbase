-- ============================================================================
-- Μεταφορά σκάφους — δύο διορθώσεις που βρήκε το tests/db/other_flows.test.sql.
--
-- 1. Η αποδοχή μεταφοράς αποτύγχανε πάντα μετά το 0096.
--
-- Ο trigger drop_stale_candidacies (0096) τρέχει και στο delivery_bookings,
-- αλλά διάβαζε new.booking_request_id — πεδίο που υπάρχει μόνο στο bookings.
-- Η PL/pgSQL το ελέγχει τη στιγμή της εκτέλεσης, οπότε κάθε αποδοχή μεταφοράς
-- έσκαγε με «record "new" has no field "booking_request_id"». Τώρα κάθε
-- πίνακας έχει το δικό του σκέλος.
--
-- 2. Κάθε απευθείας ανάγνωση των πινάκων μεταφοράς απέτυχε με «infinite
-- recursion detected in policy»: οι κανόνες πρόσβασης του delivery_requests
-- κοίταζαν το delivery_role_requests, του οποίου οι κανόνες κοίταζαν πίσω το
-- delivery_requests. Η εφαρμογή σήμερα διαβάζει μόνο μέσω συναρτήσεων, οπότε
-- δεν φαινόταν — αλλά η πρώτη απευθείας ανάγνωση θα έσπαγε. Οι διασταυρούμενοι
-- έλεγχοι γίνονται πλέον από βοηθητικές συναρτήσεις (ίδιο μοτίβο με το
-- owns_booking_request των ναύλων), που δεν ξαναπερνούν από τους κανόνες.
-- ============================================================================
create or replace function drop_stale_candidacies() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'confirmed' then return null; end if;

  if tg_table_name = 'bookings' then
    update booking_request_pings p set status = 'missed', withdrawn_at = now()
    from booking_requests br
    where br.id = p.booking_request_id
      and br.origin = 'admin_replacement' and br.status = 'open'
      and p.skipper_id = new.skipper_id and p.status = 'pending' and p.candidate_at is not null
      and daterange(br.start_date, br.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
      and br.id is distinct from new.booking_request_id;
  else
    update booking_request_pings p set status = 'missed', withdrawn_at = now()
    from booking_requests br
    where br.id = p.booking_request_id
      and br.origin = 'admin_replacement' and br.status = 'open'
      and p.skipper_id = new.skipper_id and p.status = 'pending' and p.candidate_at is not null
      and daterange(br.start_date, br.end_date, '[]') && new.estimated_range;
  end if;
  return null;
end;
$$;

create or replace function owns_delivery_request(p_delivery_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from delivery_requests where id = p_delivery_request_id and client_id = auth.uid());
$$;

create or replace function owns_delivery_role_request(p_role_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from delivery_role_requests rr join delivery_requests dr on dr.id = rr.delivery_request_id
    where rr.id = p_role_request_id and dr.client_id = auth.uid()
  );
$$;

create or replace function pinged_for_delivery_role_request(p_role_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from delivery_role_pings p
    where p.delivery_role_request_id = p_role_request_id and p.skipper_id = my_skipper_profile_id()
  );
$$;

create or replace function pinged_for_delivery_request(p_delivery_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from delivery_role_requests rr join delivery_role_pings p on p.delivery_role_request_id = rr.id
    where rr.delivery_request_id = p_delivery_request_id and p.skipper_id = my_skipper_profile_id()
  );
$$;

grant execute on function owns_delivery_request(uuid), owns_delivery_role_request(uuid),
  pinged_for_delivery_role_request(uuid), pinged_for_delivery_request(uuid) to authenticated;

drop policy if exists "client reads own delivery requests" on delivery_requests;
create policy "client reads own delivery requests" on delivery_requests for select using (
  client_id = auth.uid() or is_admin() or pinged_for_delivery_request(id)
);

drop policy if exists "delivery role requests visible to owner and pinged" on delivery_role_requests;
create policy "delivery role requests visible to owner and pinged" on delivery_role_requests for select using (
  is_admin() or owns_delivery_request(delivery_request_id) or pinged_for_delivery_role_request(id)
);

drop policy if exists "delivery ping visible to client and pinged skipper" on delivery_role_pings;
create policy "delivery ping visible to client and pinged skipper" on delivery_role_pings for select using (
  is_admin() or owns_delivery_role_request(delivery_role_request_id) or skipper_id = my_skipper_profile_id()
);
