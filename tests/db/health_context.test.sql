-- Υγεία εφαρμογής (0120): κάθε αναφορά φέρνει αρκετά στοιχεία για να
-- διορθωθεί (έκδοση, συσκευή, «προβολή ως», τελευταία βήματα), χωρίς
-- προσωπικά στοιχεία, και ο διακομιστής αναφέρει τα δικά του σφάλματα.
\i tests/db/helpers.sql

\echo '== αναφορά με πλαίσιο, από χρήστη'
select pg_temp.act('authenticated', :'CLIENT');
select report_app_issue('error', 'unhandled_promise', '/platform/requests', 'Cannot read properties of undefined',
  jsonb_build_object(
    'v', 'b3700cb',
    'd', 'Android · Chrome',
    'va', true,
    't', jsonb_build_array(
      'άνοιξε /platform/requests',
      'πάτησε «Ειδοποιήσεις»',
      'mark_notifications_read → 42501',
      'πάτησε «Μαρία maria@example.com 6912345678»',
      'άνοιξε /platform/booking/8a6f0c1e-1111-4222-8333-944445555666',
      'α', 'β', 'γ', 'δ', 'ε'),
    'password', 'μυστικό',
    'phone', '+306912345678'));
-- Παλιά μορφή (4 ορίσματα) από browser που δεν ανανεώθηκε: δουλεύει ακόμα.
select report_app_issue('error', 'old_client', '/platform', 'παλιός browser');

select pg_temp.act('postgres');
select context::text as ctx from health_events where fingerprint = 'app:error:unhandled_promise@/platform/requests' \gset
select pg_temp.check('κρατά έκδοση, συσκευή, «προβολή ως»',
  (select context->>'v' = 'b3700cb' and context->>'d' = 'Android · Chrome' and (context->>'va')::boolean
     from health_events where fingerprint = 'app:error:unhandled_promise@/platform/requests'));
select pg_temp.check('κρατά τα βήματα, το πολύ 8',
  (select jsonb_array_length(context->'t') = 8 and context->'t'->>0 = 'άνοιξε /platform/requests'
          and context->'t'->>2 = 'mark_notifications_read → 42501'
     from health_events where fingerprint = 'app:error:unhandled_promise@/platform/requests'));
select pg_temp.check('πετά άγνωστα πεδία (password, phone)', :'ctx' !~ 'password|phone|μυστικό');
select pg_temp.check('χωρίς email, τηλέφωνο, ids: ' || :'ctx', :'ctx' !~ 'maria@|6912345678|8a6f0c1e' and :'ctx' ~ '\[email\]' and :'ctx' ~ ':id');
select pg_temp.check('το δείγμα του θέματος έχει το πλαίσιο',
  (select sample->'context'->>'d' = 'Android · Chrome' and sample->>'detail' like 'Cannot read%'
     from health_issues where fingerprint = 'app:error:unhandled_promise@/platform/requests'));
select pg_temp.check('η παλιά μορφή καταγράφεται, χωρίς πλαίσιο',
  (select count(*) = 1 and bool_and(context is null) from health_events where fingerprint = 'app:error:old_client@/platform'));

\echo '== αποτυχία ενέργειας στη βάση'
select pg_temp.act('authenticated', :'CLIENT');
select report_app_issue('rpc', 'claim_booking_request.42501', '/platform/requests', 'permission denied',
  '{"t": ["πάτησε «Αποδοχή»", "claim_booking_request → 42501"]}'::jsonb);
select pg_temp.act('postgres');
select pg_temp.check('νέο είδος «rpc» με δικό του τίτλο',
  (select title = 'Αποτυχία ενέργειας στη βάση' from health_issues where fingerprint = 'app:rpc:claim_booking_request.42501@/platform/requests'));

\echo '== σφάλμα διακομιστή: μόνο ο διακομιστής'
select pg_temp.act('anon');
select pg_temp.expect($$select report_server_issue('x', '/api/x', 'y')$$, 'permission denied for function report_server_issue');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select report_server_issue('x', '/api/x', 'y')$$, 'permission denied for function report_server_issue');
select pg_temp.act('service_role');
select report_server_issue('TypeError', '/api/platform/account/change-phone',
  'Cannot read properties of null (reading ''id'') for user maria@example.com', '{"v": "b3700cb", "t": ["POST"]}'::jsonb);
select report_server_issue('TypeError', '/api/platform/account/change-phone', 'ίδιο, αμέσως μετά');
select pg_temp.act('postgres');
select pg_temp.check('καταγράφηκε ως «Σφάλμα διακομιστή», χωρίς email',
  (select title = 'Σφάλμα διακομιστή' and sample->>'detail' !~ 'maria@' and sample->'context'->>'v' = 'b3700cb'
     from health_issues where fingerprint = 'app:server:TypeError@/api/platform/account/change-phone'));
select pg_temp.check('ίδιο σφάλμα μέσα στο λεπτό: μία φορά',
  (select count(*) = 1 from health_events where fingerprint = 'app:server:TypeError@/api/platform/account/change-phone'));

\echo '== τα γεγονότα ενός θέματος: μόνο ο ιδιοκτήτης'
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select * from admin_health_events('app:error:unhandled_promise@/platform/requests')$$, 'owner_only');
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('ο ιδιοκτήτης βλέπει πλαίσιο, όχι χρήστη',
  (select count(*) = 1 and bool_and(context ? 't') from admin_health_events('app:error:unhandled_promise@/platform/requests')));
