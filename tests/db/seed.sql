-- Test actors, shared by the database tests and the browser tests. Every
-- skipper is available in Κυκλάδες (+5..+40 days), except one who is only
-- available in the Ionian — for checking region filtering.
-- PIN for every account in the browser tests: 123456 (fake auth gateway).
insert into auth.users (id, phone) values
 ('a0000000-0000-0000-0000-000000000001','306900002001'),
 ('a0000000-0000-0000-0000-000000000002','306900002002'),
 ('a0000000-0000-0000-0000-000000000003','306900002003'),
 ('a0000000-0000-0000-0000-000000000004','306900002004'),
 ('a0000000-0000-0000-0000-000000000005','306900002005'),
 ('a0000000-0000-0000-0000-000000000006','306900002006'),
 ('a0000000-0000-0000-0000-000000000007','306900002007'),
 ('a0000000-0000-0000-0000-000000000008','306900002008');
insert into users (id, role, phone_number, full_name, status, phone_verified_at, wallet_balance, photo_reviewed_at) values
 ('a0000000-0000-0000-0000-000000000001','admin','+306900002001','Admin Διαχειριστής','active',now(),0,now()),
 ('a0000000-0000-0000-0000-000000000002','client','+306900002002','Μαρία Πελάτη','active',now(),100,now()),
 ('a0000000-0000-0000-0000-000000000003','skipper','+306900002003','Νίκος Αρχικός','active',now(),100,now()),
 ('a0000000-0000-0000-0000-000000000004','skipper','+306900002004','Γιώργος Υποψήφιος','active',now(),100,now()),
 ('a0000000-0000-0000-0000-000000000005','skipper','+306900002005','Κώστας Υποψήφιος','active',now(),100,now()),
 ('a0000000-0000-0000-0000-000000000006','skipper','+306900002006','Ελένη Υποψήφια','active',now(),100,now()),
 ('a0000000-0000-0000-0000-000000000007','skipper','+306900002007','Πέτρος Αρνείται','active',now(),100,now()),
 ('a0000000-0000-0000-0000-000000000008','skipper','+306900002008','Σοφία Σιωπηλή','active',now(),100,now());
insert into skipper_profiles (id, user_id, role, full_name, license_number, license_type, price_per_day, approval_status, years_experience, gender, date_of_birth) values
 ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000003','skipper','Νίκος Αρχικός','L3','A',250,'approved',10,'male','1980-01-01'),
 ('b0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000004','skipper','Γιώργος Υποψήφιος','L4','A',230,'approved',6,'male','1985-01-01'),
 ('b0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000005','skipper','Κώστας Υποψήφιος','L5','A',280,'approved',12,'male','1975-01-01'),
 ('b0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000006','skipper','Ελένη Υποψήφια','L6','A',300,'approved',15,'female','1978-01-01'),
 ('b0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000007','skipper','Πέτρος Αρνείται','L7','A',240,'approved',5,'male','1990-01-01'),
 ('b0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000008','skipper','Σοφία Σιωπηλή','L8','A',260,'approved',7,'female','1988-01-01');
-- Availability in Κυκλάδες
insert into availability_windows (skipper_id, start_date, end_date)
 select id, current_date+5, current_date+40 from skipper_profiles where id::text like 'b0000000%';
insert into availability_window_regions (window_id, region_id)
 select w.id, r.id from availability_windows w, regions r where r.name='Κυκλάδες' and w.skipper_id::text like 'b0000000%';
-- languages so profiles look realistic
insert into user_languages (user_id, language_id)
 select u.id, l.id from users u, languages l where u.id::text like 'a0000000%' and l.name in ('Ελληνικά','Αγγλικά') on conflict do nothing;
insert into skipper_boat_types (skipper_id, boat_type_id) select sp.id, bt.id from skipper_profiles sp, boat_types bt where bt.name='Ιστιοπλοϊκό';
-- A skipper only available in the Ionian, to test region filtering
insert into auth.users(id,phone) values ('a0000000-0000-0000-0000-000000000009','306900002009');
insert into users (id, role, phone_number, full_name, status, phone_verified_at, wallet_balance, photo_reviewed_at) values ('a0000000-0000-0000-0000-000000000009','skipper','+306900002009','Ιόνιος Κέρκυρα','active',now(),100,now());
insert into skipper_profiles (id,user_id,role,full_name,price_per_day,approval_status,years_experience) values ('b0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000009','skipper','Ιόνιος Κέρκυρα',250,'approved',3);
with w as (insert into availability_windows (skipper_id,start_date,end_date) values ('b0000000-0000-0000-0000-000000000009', current_date, current_date+60) returning id) insert into availability_window_regions select w.id, r.id from w, regions r where r.name='Ιόνιο';
insert into skipper_boat_types (skipper_id, boat_type_id) select 'b0000000-0000-0000-0000-000000000009', id from boat_types where name='Ιστιοπλοϊκό';

-- The balances above were set directly; record them as deposits so every
-- balance equals the sum of its ledger, as in production. tests/db/run.sh
-- checks that this still holds after every test (tests/db/wallet_check.sql).
alter table wallet_transactions disable trigger trg_notify_wallet_movement;
insert into wallet_transactions (user_id, type, amount)
select u.id, 'deposit', u.wallet_balance - coalesce((select sum(amount) from wallet_transactions t where t.user_id = u.id), 0)
  from users u
 where u.wallet_balance <> coalesce((select sum(amount) from wallet_transactions t where t.user_id = u.id), 0);
alter table wallet_transactions enable trigger trg_notify_wallet_movement;
