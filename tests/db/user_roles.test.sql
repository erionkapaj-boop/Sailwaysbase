-- Μοντέλο ρόλων (0139): αυτόματοι ρόλοι από τα υπάρχοντα δεδομένα, τρέχων ρόλος, αιτήσεις, αποφάσεις, ασφάλεια.
\i tests/db/helpers.sql

select pg_temp.act('postgres');
\echo '== μετάπτωση / αυτόματοι ρόλοι (το seed μπήκε μετά τα triggers)'
select pg_temp.check('κάθε χρήστης έχει Πελάτη ενεργό', (select count(*) = 0 from users u where not exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'client' and r.status = 'active')));
select pg_temp.check('εγκεκριμένος skipper → Επαγγελματίας ενεργός', (select status = 'active' from user_roles where user_id = :'NIKOS' and role = 'professional'));
select pg_temp.check('ο πελάτης δεν έχει Επαγγελματία', not exists (select 1 from user_roles where user_id = :'CLIENT' and role = 'professional'));
select pg_temp.check('admin → Administrator ενεργός', (select status = 'active' from user_roles where user_id = :'ADMIN' and role = 'admin'));
select pg_temp.check('κανείς δεν έχει Εταιρεία/Δημιουργό χωρίς αίτηση', not exists (select 1 from user_roles where role in ('company', 'creator')));
select pg_temp.check('τρέχων ρόλος αρχικά Πελάτης', (select count(*) = 0 from users where active_role <> 'client'));

\echo '== το backfill ξαναπερνά με ασφάλεια και αναπαράγει τα ίδια'
select count(*) as before_n from user_roles \gset
select backfill_user_roles();
select pg_temp.check('backfill idempotent', (select count(*) from user_roles) = :before_n);

\echo '== παρακολούθηση του υπάρχοντος συστήματος εγκρίσεων'
select set_config('platform.trusted', 'true', false);
update skipper_profiles set approval_status = 'pending' where user_id = :'PETROS';
select pg_temp.check('προφίλ σε έλεγχο → ρόλος pending', (select status = 'pending' from user_roles where user_id = :'PETROS' and role = 'professional'));
update skipper_profiles set approval_status = 'rejected' where user_id = :'PETROS';
select pg_temp.check('προφίλ απορρίφθηκε → ρόλος rejected', (select status = 'rejected' from user_roles where user_id = :'PETROS' and role = 'professional'));
update skipper_profiles set approval_status = 'approved' where user_id = :'PETROS';
select pg_temp.check('προφίλ εγκρίθηκε → ρόλος active', (select status = 'active' from user_roles where user_id = :'PETROS' and role = 'professional'));
update users set is_staff_admin = true where id = :'SOFIA';
select pg_temp.check('is_staff_admin → Ομάδα', (select status = 'active' from user_roles where user_id = :'SOFIA' and role = 'team'));
update users set is_staff_admin = false where id = :'SOFIA';
select pg_temp.check('αφαίρεση is_staff_admin → φεύγει ο ρόλος', not exists (select 1 from user_roles where user_id = :'SOFIA' and role = 'team'));
select set_config('platform.trusted', '', false);

\echo '== τρέχων ρόλος'
select pg_temp.act('authenticated', :'NIKOS');
select pg_temp.check('get_my_roles: Πελάτης + Επαγγελματίας, τρέχων Πελάτης', (
  select r ->> 'active_role' = 'client' and jsonb_array_length(r -> 'roles') = 2 and r -> 'roles' -> 0 ->> 'role' = 'client' and r -> 'roles' -> 1 ->> 'role' = 'professional'
  from (select get_my_roles() r) x));
select set_active_role('professional');
select pg_temp.check('αλλαγή ρόλου αποθηκεύεται', (select active_role = 'professional' from users where id = :'NIKOS'));
select pg_temp.check('και διαβάζεται ξανά', (get_my_roles() ->> 'active_role') = 'professional');
select pg_temp.expect($$select set_active_role('admin')$$, 'role_not_active');
select pg_temp.expect($$select set_active_role('company')$$, 'role_not_active');
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select set_active_role('professional')$$, 'role_not_active');
update users set active_role = 'admin' where id = auth.uid();
select pg_temp.check('άμεση αλλαγή active_role δεν περνά', (select active_role = 'client' from users where id = :'CLIENT'));
select pg_temp.act('authenticated', :'NIKOS');
update users set active_role = 'client' where id = auth.uid();
select pg_temp.check('ούτε άμεσο update στον ενεργό χρήστη', (select active_role = 'professional' from users where id = :'NIKOS'));

\echo '== απώλεια ρόλου → επιστροφή σε Πελάτη'
select pg_temp.act('postgres');
select set_config('platform.trusted', 'true', false);
update skipper_profiles set approval_status = 'rejected' where user_id = :'NIKOS';
select set_config('platform.trusted', '', false);
select pg_temp.check('απορρίφθηκε ο Επαγγελματίας → τρέχων ρόλος Πελάτης', (select active_role = 'client' from users where id = :'NIKOS'));
select set_config('platform.trusted', 'true', false);
update skipper_profiles set approval_status = 'approved' where user_id = :'NIKOS';
select set_config('platform.trusted', '', false);

\echo '== αίτηση ρόλου (Εταιρεία, Δημιουργός)'
select pg_temp.act('authenticated', :'CLIENT');
select request_role('company');
select pg_temp.check('αίτηση → pending', (select status = 'pending' from user_roles where user_id = :'CLIENT' and role = 'company'));
select pg_temp.expect($$select set_active_role('company')$$, 'role_not_active');
select pg_temp.expect($$select request_role('admin')$$, 'role_not_requestable');
select pg_temp.expect($$select request_role('professional')$$, 'role_not_requestable');
select pg_temp.expect($$select request_role('team')$$, 'role_not_requestable');
select pg_temp.expect($$insert into user_roles (user_id, role, status) values (auth.uid(), 'admin', 'active')$$, 'permission denied for table user_roles');
select pg_temp.expect($$update user_roles set status = 'active' where user_id = auth.uid()$$, 'permission denied for table user_roles');
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.check('ο admin βλέπει τους ρόλους του χρήστη', (admin_get_user_roles(:'CLIENT') -> 'roles' -> 1 ->> 'role') = 'company');
select pg_temp.act('authenticated', :'KOSTAS');
select pg_temp.check('άλλος χρήστης δεν βλέπει ξένους ρόλους (RLS)', (select count(*) = 0 from user_roles where user_id = :'CLIENT'));
select pg_temp.expect($$select admin_decide_role('a0000000-0000-0000-0000-000000000002', 'company', 'active')$$, 'not_admin');
select pg_temp.expect($$select admin_get_user_roles('a0000000-0000-0000-0000-000000000002')$$, 'not_admin');

\echo '== απόφαση διαχείρισης'
select pg_temp.act('authenticated', :'ADMIN');
select pg_temp.expect($$select admin_decide_role('a0000000-0000-0000-0000-000000000002', 'professional', 'active')$$, 'role_not_decidable');
select pg_temp.expect($$select admin_decide_role('a0000000-0000-0000-0000-000000000002', 'company', 'pending')$$, 'invalid_status');
select pg_temp.expect($$select admin_decide_role('a0000000-0000-0000-0000-000000000002', 'creator', 'active')$$, 'role_not_found');
select admin_decide_role(:'CLIENT', 'company', 'active');
select pg_temp.check('εγκρίθηκε η Εταιρεία', (select status = 'active' and decided_by = :'ADMIN' and decided_at is not null from user_roles where user_id = :'CLIENT' and role = 'company'));
select pg_temp.check('καταγράφεται στο admin_actions', (select count(*) = 1 from admin_actions where action_type = 'role_active' and target_user_id = :'CLIENT' and notes = 'company'));
select pg_temp.act('authenticated', :'CLIENT');
select set_active_role('company');
select pg_temp.check('μετά την έγκριση μπορεί να γίνει τρέχων', (select active_role = 'company' from users where id = :'CLIENT'));
select pg_temp.act('authenticated', :'ADMIN');
select admin_decide_role(:'CLIENT', 'company', 'rejected');
select pg_temp.act('postgres');
select pg_temp.check('απόρριψη του τρέχοντος ρόλου → επιστροφή σε Πελάτη', (select active_role = 'client' from users where id = :'CLIENT'));
select pg_temp.act('authenticated', :'CLIENT');
select request_role('company');
select pg_temp.check('μετά την απόρριψη μπορεί να ξαναζητήσει → pending', (select status = 'pending' from user_roles where user_id = :'CLIENT' and role = 'company'));

\echo '== ασφάλεια: εσωτερικές συναρτήσεις και anon'
select pg_temp.expect($$select refresh_user_roles('a0000000-0000-0000-0000-000000000002')$$, 'permission denied for function refresh_user_roles');
select pg_temp.expect($$select set_user_role_state('a0000000-0000-0000-0000-000000000002', 'admin', 'active')$$, 'permission denied for function set_user_role_state');
select pg_temp.expect($$select backfill_user_roles()$$, 'permission denied for function backfill_user_roles');
select pg_temp.act('anon');
select pg_temp.expect($$select get_my_roles()$$, 'permission denied for function get_my_roles');
select pg_temp.expect($$select set_active_role('client')$$, 'permission denied for function set_active_role');
select pg_temp.expect($$select request_role('company')$$, 'permission denied for function request_role');
select pg_temp.expect($$select count(*) from user_roles$$, 'permission denied for table user_roles');

\echo '== νέος χρήστης παίρνει αυτόματα Πελάτη'
select pg_temp.act('postgres');
insert into auth.users(id,phone) values ('a0000000-0000-0000-0000-0000000000f1','306900009991');
insert into users (id, role, phone_number, full_name, status) values ('a0000000-0000-0000-0000-0000000000f1','client','+306900009991','Νέος Χρήστης','active');
select pg_temp.check('νέος χρήστης → Πελάτης ενεργός, τρέχων Πελάτης', (
  select r.status = 'active' and u.active_role = 'client' from users u join user_roles r on r.user_id = u.id and r.role = 'client' where u.id = 'a0000000-0000-0000-0000-0000000000f1'));
