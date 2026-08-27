-- ============================================================================
-- Διόρθωση ονομασίας/κάλυψης περιοχών: "Αττική" → "Σαρωνικός" (η ναυτική
-- ονομασία της περιοχής, όχι η διοικητική — έτσι το παράδειγμα με τη
-- Σαλαμίνα/Αίγινα βγάζει νόημα), και επαναφορά της Κρήτης ως επιλέξιμη
-- περιοχή με δύο ενεργά λιμάνια (είχαν απενεργοποιηθεί/διαγραφεί στο 0010).
--
-- Idempotent — ασφαλές να τρέξει ξανά.
-- ============================================================================

update regions set name = 'Σαρωνικός' where name = 'Αττική';

insert into regions (name) values ('Κρήτη')
on conflict (name) do nothing;

insert into ports (name, region_id, tier, active)
select 'Χανιά', r.id, 'secondary', true from regions r where r.name = 'Κρήτη'
on conflict (name) do update set region_id = excluded.region_id, tier = excluded.tier, active = true;

insert into ports (name, region_id, tier, active)
select 'Ηράκλειο', r.id, 'secondary', true from regions r where r.name = 'Κρήτη'
on conflict (name) do update set region_id = excluded.region_id, tier = excluded.tier, active = true;
