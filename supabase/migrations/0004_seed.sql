-- Seed lookups so search/profile-editing has something to select from.
-- `region` stays a free-text field per the data model (§ open issues) so a
-- future country expansion needs no schema change — just more rows.

insert into languages (name) values
  ('Ελληνικά'), ('Αγγλικά'), ('Γερμανικά'), ('Γαλλικά'), ('Ιταλικά'), ('Ισπανικά')
on conflict (name) do nothing;

insert into boat_types (name) values
  ('Ιστιοπλοϊκό'), ('Καταμαράν'), ('Μηχανοκίνητο'), ('Gulet')
on conflict (name) do nothing;

insert into ports (name, region) values
  ('Αλίμος', 'Αττική'),
  ('Πειραιάς', 'Αττική'),
  ('Λαύριο', 'Αττική'),
  ('Ύδρα', 'Αργοσαρωνικός'),
  ('Πόρος', 'Αργοσαρωνικός'),
  ('Σπέτσες', 'Αργοσαρωνικός'),
  ('Λευκάδα', 'Ιόνιο'),
  ('Κέρκυρα', 'Ιόνιο'),
  ('Ζάκυνθος', 'Ιόνιο'),
  ('Ρόδος', 'Δωδεκάνησα'),
  ('Κως', 'Δωδεκάνησα'),
  ('Μύκονος', 'Κυκλάδες'),
  ('Σαντορίνη', 'Κυκλάδες'),
  ('Πάρος', 'Κυκλάδες'),
  ('Χανιά', 'Κρήτη'),
  ('Ηράκλειο', 'Κρήτη')
on conflict do nothing;
