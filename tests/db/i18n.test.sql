-- Υποδομή γλωσσών (0123): γλώσσα λογαριασμού και λατινικά ονόματα.
-- Τα παραδείγματα μετατροπής είναι τα ίδια με του JS (tests/fixtures/translit.json),
-- ώστε οι δύο εκδόσεις να μην αποκλίνουν ποτέ.
\i tests/db/helpers.sql

\set vectors `cat tests/fixtures/translit.json`

\echo '== greek_to_latin: ίδια παραδείγματα με το JS'
select pg_temp.check('greek_to_latin ' || (v ->> 0) || ' → ' || (v ->> 1), greek_to_latin(v ->> 0) = v ->> 1)
  from jsonb_array_elements(:'vectors'::jsonb) v;
select pg_temp.check('null δεν σπάει', greek_to_latin(null) = '');
select pg_temp.act('anon');
select pg_temp.check('ο μετατροπέας είναι δημόσιος (καθαρή συνάρτηση, χωρίς δεδομένα)', greek_to_latin('Άννα') = 'Anna');
select pg_temp.act('postgres');

\echo '== γλώσσα λογαριασμού'
select pg_temp.check('προεπιλογή: ελληνικά', (select locale = 'el' from users where id = :'CLIENT'));
select pg_temp.act('authenticated', :'CLIENT');
select set_my_locale('en');
select pg_temp.act('postgres');
select pg_temp.check('η πελάτισσα έγινε en, οι υπόλοιποι όχι',
  (select locale = 'en' from users where id = :'CLIENT') and (select count(*) = 0 from users where id <> :'CLIENT' and locale <> 'el'));
select pg_temp.act('authenticated', :'CLIENT');
select pg_temp.expect($$select set_my_locale('EN')$$, 'invalid_locale');
select pg_temp.expect($$select set_my_locale('english-language')$$, 'invalid_locale');
select pg_temp.expect($$select set_my_locale('')$$, 'invalid_locale');
select pg_temp.expect($$select set_my_locale(null)$$, 'invalid_locale');
select set_my_locale('pt-BR');
select set_my_locale('el');
select pg_temp.check('επιτρέπονται κωδικοί με περιοχή (pt-BR) και επιστροφή σε el', (select locale = 'el' from users where id = :'CLIENT'));
-- Άμεση εγγραφή στη στήλη: η μορφή ελέγχεται κι εκεί.
select pg_temp.expect(format($$update users set locale = 'xx yy' where id = %L$$, :'CLIENT'), '%users_locale_format%');
select pg_temp.act('anon');
select pg_temp.expect($$select set_my_locale('en')$$, 'permission denied%');
select pg_temp.act('postgres');
-- Η γλώσσα ενός δεν αλλάζει από τον άλλον: η συνάρτηση γράφει μόνο στον δικό σου λογαριασμό.
select pg_temp.act('authenticated', :'KOSTAS');
select set_my_locale('en');
select pg_temp.act('postgres');
select pg_temp.check('ο Κώστας έγινε en, η πελάτισσα έμεινε el',
  (select locale = 'en' from users where id = :'KOSTAS') and (select locale = 'el' from users where id = :'CLIENT'));

\echo '== λατινικό όνομα: παράγωγο από το όνομα'
select pg_temp.check('υπάρχοντα ονόματα: Μαρία Πελάτη → Maria Pelati', (select full_name_latin = 'Maria Pelati' from users where id = :'CLIENT'));
select pg_temp.check('επαγγελματίας: Γιώργος Υποψήφιος → Giorgos Ypopsifios', (select full_name_latin = 'Giorgos Ypopsifios' from skipper_profiles where full_name = 'Γιώργος Υποψήφιος'));
select pg_temp.check('όλες οι γραμμές έχουν λατινικό όνομα και κανένα δεν έχει ελληνικά',
  (select count(*) = 0 from users where full_name is not null and (full_name_latin is null or full_name_latin ~ '[Ͱ-Ͽ]'))
  and (select count(*) = 0 from skipper_profiles where full_name is not null and (full_name_latin is null or full_name_latin ~ '[Ͱ-Ͽ]')));

update users set full_name = 'Άννα Μπόντι' where id = :'CLIENT';
select pg_temp.check('αλλαγή ονόματος ξαναϋπολογίζει το λατινικό', (select full_name_latin = 'Anna Bonti' from users where id = :'CLIENT'));
update users set full_name = 'Anna Smith' where id = :'CLIENT';
select pg_temp.check('όνομα που είναι ήδη λατινικό μένει όπως είναι', (select full_name_latin = 'Anna Smith' from users where id = :'CLIENT'));
update users set full_name = 'Μαρία Πελάτη' where id = :'CLIENT';

-- Ο χρήστης δεν γράφει το δικό του «λατινικό»: ό,τι κι αν στείλει, ξαναϋπολογίζεται.
select pg_temp.act('authenticated', :'CLIENT');
update users set full_name_latin = 'Call me 6900000000' where id = :'CLIENT';
select pg_temp.act('postgres');
select pg_temp.check('άμεση εγγραφή στο λατινικό όνομα αναιρείται', (select full_name_latin = 'Maria Pelati' from users where id = :'CLIENT'));
-- Ούτε ο ιδιοκτήτης δεν χρειάζεται να το γράψει: μένει συνεπές με το όνομα.
update users set full_name_latin = 'x' where id = :'CLIENT';
select pg_temp.check('ούτε με απευθείας αλλαγή από τη βάση δεν ξεφεύγει', (select full_name_latin = 'Maria Pelati' from users where id = :'CLIENT'));

-- Νέος λογαριασμός: το λατινικό υπολογίζεται στην εισαγωγή.
insert into auth.users (id, phone) values ('d3000000-0000-0000-0000-000000000001', '306911110099');
insert into users (id, role, full_name, phone_number, status) values ('d3000000-0000-0000-0000-000000000001', 'client', 'Ευαγγελία Ντούρου', '+306911110099', 'active');
select pg_temp.check('νέος λογαριασμός: Ευαγγελία Ντούρου → Evangelia Ntourou', (select full_name_latin = 'Evangelia Ntourou' from users where id = 'd3000000-0000-0000-0000-000000000001'));

\echo '== το λατινικό όνομα δεν φαίνεται πουθενά που δεν φαινόταν το όνομα'
select pg_temp.act('anon');
select pg_temp.check('ανώνυμος: δεν διαβάζει πίνακα χρηστών', (select count(*) = 0 from users));
select pg_temp.check('ανώνυμος: τα αποτελέσματα αναζήτησης δεν έχουν ονόματα, ούτε λατινικά',
  not exists (select 1 from information_schema.columns where table_name = 'skipper_public' and column_name in ('full_name', 'full_name_latin')));
select pg_temp.act('postgres');
