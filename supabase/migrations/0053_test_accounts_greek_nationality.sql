-- ============================================================================
-- Ζητήθηκε: όλα τα test προφίλ (users.is_test_account = true) να έχουν
-- εθνικότητα Ελληνική, ώστε να φαίνεται η ελληνική σημαία δίπλα τους στις
-- κάρτες αναζήτησης/καμπανάκια — τόσο επαγγελματίες όσο και πελάτες, αφού
-- και οι δύο κατευθύνσεις δείχνουν πλέον τη σημαία.
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

update skipper_profiles sp
set nationality_id = (select id from nationalities where name = 'Ελληνική')
from users u
where u.id = sp.user_id and u.is_test_account = true;

update client_profiles cp
set nationality_id = (select id from nationalities where name = 'Ελληνική')
from users u
where u.id = cp.user_id and u.is_test_account = true;
