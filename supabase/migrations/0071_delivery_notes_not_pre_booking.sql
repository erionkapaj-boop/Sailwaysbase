-- ============================================================================
-- Πραγματικό, σοβαρό πρόβλημα εμπιστοσύνης (αναφέρθηκε από τον χρήστη με
-- screenshot από την πραγματική πλατφόρμα): το πεδίο "Σημειώσεις" στο
-- αίτημα μεταφοράς είναι ελεύθερο κείμενο, και το list_my_delivery_pings
-- (0067) γύριζε ολόκληρη τη γραμμή delivery_requests — notes included —
-- στον υποψήφιο ΠΡΙΝ καν αποδεχτεί το αίτημα. Ένας πελάτης μπορούσε να
-- γράψει το τηλέφωνό του εκεί και να παρακάμψει εντελώς τον κανόνα "τα
-- στοιχεία επικοινωνίας αποκαλύπτονται μόνο μετά την επιβεβαίωση κράτησης"
-- — κανόνας που ισχύει παντού αλλού στην πλατφόρμα (η κανονική αναζήτηση
-- πληρώματος δεν έχει καν ελεύθερο πεδίο κειμένου πριν την αποδοχή) και
-- είναι γραμμένος ρητά στους όρους χρήσης.
--
-- Η αφαίρεση του πεδίου μόνο από το UI δεν αρκούσε — η απάντηση του RPC
-- περιείχε ούτως ή άλλως το notes στο network response, οπότε ήταν ορατό
-- από devtools ασχέτως τι δείχνει η οθόνη. Η διόρθωση πρέπει να είναι
-- server-side: το request που βλέπει ο υποψήφιος έχει πλέον notes = null,
-- ενώ ο ίδιος ο πελάτης (list_my_delivery_requests) και ο admin
-- (admin_list_delivery_requests) εξακολουθούν να το βλέπουν κανονικά.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================
create or replace function list_my_delivery_pings()
returns table(
  ping delivery_role_pings,
  role_request delivery_role_requests,
  request delivery_requests
)
language sql stable security definer set search_path = public as $$
  select
    p, rr,
    (dr.id, dr.client_id, dr.origin_point, dr.destination_point, dr.distance_miles,
     dr.date_mode, dr.departure_date, dr.flexible_days,
     dr.covers_travel, dr.covers_fuel, dr.covers_food,
     null, dr.created_at)::delivery_requests as request
  from delivery_role_pings p
  join delivery_role_requests rr on rr.id = p.delivery_role_request_id
  join delivery_requests dr on dr.id = rr.delivery_request_id
  join skipper_profiles sp on sp.id = p.skipper_id
  where sp.user_id = auth.uid()
  order by p.sent_at desc;
$$;
