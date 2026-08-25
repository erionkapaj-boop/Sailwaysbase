-- ============================================================================
-- Καθαρισμός δοκιμαστικών δεδομένων: μηδενίζει το ιστορικό ΟΛΩΝ των
-- λογαριασμών (κρατήσεις, αιτήματα, μηνύματα, αξιολογήσεις, αναφορές
-- ακύρωσης, κινήσεις πορτοφολιού, ειδοποιήσεις) και δίνει σε όλους 200€.
--
-- ΔΕΝ πειράζει: ποιοι λογαριασμοί υπάρχουν, τα στοιχεία τους (όνομα,
-- τηλέφωνο, τιμή, έγκριση), ή τη δηλωμένη διαθεσιμότητά τους.
--
-- Μία συναλλαγή: αν κάτι σκάσει, δεν μένει τίποτα μισοτελειωμένο.
-- Δεν είναι αναστρέψιμο μόλις κάνει commit — τρέξε το μόνο αν είσαι σίγουρος.
-- ============================================================================

begin;

-- Τα bookings και τα booking_requests δείχνουν το ένα στο άλλο
-- (booking_requests.replaces_booking_id για τις αντικαταστάσεις ακυρώσεων,
-- 0026) — κύκλος αναφορών που πρέπει να σπάσει πρώτα, αλλιώς καμία από τις
-- δύο διαγραφές παρακάτω δεν θα περάσει.
update booking_requests set replaces_booking_id = null;
update bookings set replaces_booking_id = null;

-- Σειρά υποχρεωτική: πρώτα ό,τι δείχνει σε bookings/booking_requests,
-- μετά τα ίδια τα bookings, μετά τα booking_requests (τα pings φεύγουν
-- αυτόματα μαζί τους, έχουν on delete cascade).
delete from messages;
delete from reviews;
delete from cancellation_reports;
delete from wallet_transactions;
delete from admin_actions;
delete from bookings;
delete from booking_requests;
delete from notifications;

-- Μηδενισμός ιστορικού + 200€ σε όλους τους επαγγελματίες.
update skipper_profiles set
  rating_avg = null,
  rating_count = 0,
  completed_bookings_count = 0,
  cancellation_flag_count = 0,
  tier = 'medium',
  wallet_balance = 200;

-- Το ίδιο για την πελατική πλευρά κάθε λογαριασμού (πελάτες, και
-- επαγγελματίες που έχουν επίσης πελατικό προφίλ, και ο admin αν έχει).
update client_profiles set
  rating_avg = null,
  rating_count = 0,
  completed_bookings_count = 0,
  cancellation_flag_count = 0,
  wallet_balance = 200;

commit;

-- Γρήγορος έλεγχος μετά: πρέπει να δείξει μηδέν παντού εκτός wallet_balance.
select
  (select count(*) from bookings) as bookings,
  (select count(*) from booking_requests) as requests,
  (select count(*) from reviews) as reviews,
  (select count(*) from cancellation_reports) as cancellations,
  (select count(*) from notifications) as notifications,
  (select count(distinct wallet_balance) from skipper_profiles) as skipper_wallet_distinct_values,
  (select count(distinct wallet_balance) from client_profiles) as client_wallet_distinct_values;
