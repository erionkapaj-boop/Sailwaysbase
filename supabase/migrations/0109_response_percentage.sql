-- ============================================================================
-- Ποσοστό ανταπόκρισης επαγγελματία, για να φαίνεται μαζί με την αξιοπιστία
-- τη στιγμή που ο πελάτης διαλέγει (αναζήτηση και αντικαταστάτες).
--
-- Απαντημένα αιτήματα (αποδοχή ή άρνηση) προς όσα έληξαν χωρίς απάντηση.
-- Μόνο για ορατά προφίλ, και μόνο από 3 αιτήματα και πάνω· αλλιώς κενό.
-- Είναι απλό ποσοστό για προβολή — όχι ο βαθμός που χρησιμοποιεί η κατάταξη.
-- ============================================================================
create or replace function skipper_response_percentages(p_ids uuid[])
returns table (skipper_id uuid, response_percentage int)
language sql stable security definer set search_path = public as $$
  select p.skipper_id,
         case when count(*) >= 3
              then round(100.0 * count(*) filter (where p.status = 'claimed' or p.declined_at is not null) / count(*))::int
         end
    from booking_request_pings p
    join booking_requests r on r.id = p.booking_request_id
   where p.skipper_id = any(p_ids[1:200])
     and (p.status = 'claimed' or p.declined_at is not null
          or (p.status = 'pending' and r.status = 'expired_unclaimed'))
     and exists (select 1 from skipper_profiles sp
                  where sp.id = p.skipper_id and sp.approval_status = 'approved' and sp.deleted_at is null)
   group by p.skipper_id
$$;
