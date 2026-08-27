-- ============================================================================
-- Ζητήθηκε: τυχαία αξιολόγηση (και στα 6 χαρακτηριστικά) για όλους τους
-- λογαριασμούς που είναι σημασμένοι ως test (users.is_test_account = true) —
-- ώστε οι κάρτες αναζήτησης/προφίλ να δείχνουν πραγματικά αριθμούς αντί για
-- «νέος στην πλατφόρμα» όταν δουλεύουμε με demo δεδομένα.
--
-- Πειράζει μόνο τις ήδη αποθηκευμένες στήλες rating_avg / rating_avg_<key> —
-- ΔΕΝ φτιάχνει πλασματικές εγγραφές στο reviews (αυτές απαιτούν πραγματική,
-- ολοκληρωμένη κράτηση ανάμεσα σε δύο πραγματικούς συμμετέχοντες, κάτι που
-- δεν μπορεί να «πλαστογραφηθεί» με ασφάλεια εδώ). Καμία επίπτωση στο
-- μέλλον: recalc_user_rating() ξαναϋπολογίζει πλήρως αυτές τις στήλες από
-- το πραγματικό reviews μόλις γίνει η πρώτη αληθινή αξιολόγηση για έναν
-- τέτοιο λογαριασμό — οπότε αυτό εδώ είναι καθαρά διακοσμητικό, μία φορά.
--
-- Κάθε φορά που τρέχει ξαναδίνει ΝΕΕΣ τυχαίες τιμές (δεν είναι idempotent με
-- την έννοια "ίδιο αποτέλεσμα ξανά" — αν θες σταθερά νούμερα τρέξε το μία
-- φορά και μετά μην το ξανατρέξεις).
-- ============================================================================

-- ---- Πελάτες (test accounts) — 6 χαρακτηριστικά πλευράς πελάτη ----
update client_profiles cp
set
  rating_avg_boat_respect = q.v1,
  rating_avg_responsibility = q.v2,
  rating_avg_cooperation = q.v3,
  rating_avg_consistency = q.v4,
  rating_avg_conduct = q.v5,
  rating_avg_tidiness = q.v6,
  rating_avg = round((q.v1 + q.v2 + q.v3 + q.v4 + q.v5 + q.v6) / 6.0, 2),
  rating_count = case when coalesce(cp.rating_count, 0) = 0 then (3 + floor(random() * 13))::int else cp.rating_count end
from (
  select cp2.user_id,
    round((1 + random() * 4)::numeric, 1) as v1,
    round((1 + random() * 4)::numeric, 1) as v2,
    round((1 + random() * 4)::numeric, 1) as v3,
    round((1 + random() * 4)::numeric, 1) as v4,
    round((1 + random() * 4)::numeric, 1) as v5,
    round((1 + random() * 4)::numeric, 1) as v6
  from client_profiles cp2
  join users u on u.id = cp2.user_id
  where u.is_test_account = true
) q
where cp.user_id = q.user_id;

-- ---- Skipper (test accounts) — 6 χαρακτηριστικά ----
update skipper_profiles sp
set
  rating_avg_safety = q.v1,
  rating_avg_seamanship = q.v2,
  rating_avg_professionalism = q.v3,
  rating_avg_cleanliness = q.v4,
  rating_avg_communication = q.v5,
  rating_avg_hospitality = q.v6,
  rating_avg = round((q.v1 + q.v2 + q.v3 + q.v4 + q.v5 + q.v6) / 6.0, 2),
  rating_count = case when coalesce(sp.rating_count, 0) = 0 then (3 + floor(random() * 13))::int else sp.rating_count end
from (
  select sp2.id,
    round((1 + random() * 4)::numeric, 1) as v1,
    round((1 + random() * 4)::numeric, 1) as v2,
    round((1 + random() * 4)::numeric, 1) as v3,
    round((1 + random() * 4)::numeric, 1) as v4,
    round((1 + random() * 4)::numeric, 1) as v5,
    round((1 + random() * 4)::numeric, 1) as v6
  from skipper_profiles sp2
  join users u on u.id = sp2.user_id
  where u.is_test_account = true and sp2.role = 'skipper'
) q
where sp.id = q.id;

-- ---- Hostess (test accounts) — 6 χαρακτηριστικά ----
update skipper_profiles sp
set
  rating_avg_cleanliness = q.v1,
  rating_avg_cooking = q.v2,
  rating_avg_service = q.v3,
  rating_avg_professionalism = q.v4,
  rating_avg_communication = q.v5,
  rating_avg_hospitality = q.v6,
  rating_avg = round((q.v1 + q.v2 + q.v3 + q.v4 + q.v5 + q.v6) / 6.0, 2),
  rating_count = case when coalesce(sp.rating_count, 0) = 0 then (3 + floor(random() * 13))::int else sp.rating_count end
from (
  select sp2.id,
    round((1 + random() * 4)::numeric, 1) as v1,
    round((1 + random() * 4)::numeric, 1) as v2,
    round((1 + random() * 4)::numeric, 1) as v3,
    round((1 + random() * 4)::numeric, 1) as v4,
    round((1 + random() * 4)::numeric, 1) as v5,
    round((1 + random() * 4)::numeric, 1) as v6
  from skipper_profiles sp2
  join users u on u.id = sp2.user_id
  where u.is_test_account = true and sp2.role = 'hostess'
) q
where sp.id = q.id;

-- ---- Cook (test accounts) — 6 χαρακτηριστικά ----
update skipper_profiles sp
set
  rating_avg_taste = q.v1,
  rating_avg_variety = q.v2,
  rating_avg_presentation = q.v3,
  rating_avg_adaptability = q.v4,
  rating_avg_organization = q.v5,
  rating_avg_cleanliness = q.v6,
  rating_avg = round((q.v1 + q.v2 + q.v3 + q.v4 + q.v5 + q.v6) / 6.0, 2),
  rating_count = case when coalesce(sp.rating_count, 0) = 0 then (3 + floor(random() * 13))::int else sp.rating_count end
from (
  select sp2.id,
    round((1 + random() * 4)::numeric, 1) as v1,
    round((1 + random() * 4)::numeric, 1) as v2,
    round((1 + random() * 4)::numeric, 1) as v3,
    round((1 + random() * 4)::numeric, 1) as v4,
    round((1 + random() * 4)::numeric, 1) as v5,
    round((1 + random() * 4)::numeric, 1) as v6
  from skipper_profiles sp2
  join users u on u.id = sp2.user_id
  where u.is_test_account = true and sp2.role = 'cook'
) q
where sp.id = q.id;

-- ---- Deckhand (test accounts) — 6 χαρακτηριστικά ----
update skipper_profiles sp
set
  rating_avg_seamanship = q.v1,
  rating_avg_safety = q.v2,
  rating_avg_maintenance = q.v3,
  rating_avg_cleanliness = q.v4,
  rating_avg_teamwork = q.v5,
  rating_avg_diligence = q.v6,
  rating_avg = round((q.v1 + q.v2 + q.v3 + q.v4 + q.v5 + q.v6) / 6.0, 2),
  rating_count = case when coalesce(sp.rating_count, 0) = 0 then (3 + floor(random() * 13))::int else sp.rating_count end
from (
  select sp2.id,
    round((1 + random() * 4)::numeric, 1) as v1,
    round((1 + random() * 4)::numeric, 1) as v2,
    round((1 + random() * 4)::numeric, 1) as v3,
    round((1 + random() * 4)::numeric, 1) as v4,
    round((1 + random() * 4)::numeric, 1) as v5,
    round((1 + random() * 4)::numeric, 1) as v6
  from skipper_profiles sp2
  join users u on u.id = sp2.user_id
  where u.is_test_account = true and sp2.role = 'deckhand'
) q
where sp.id = q.id;
