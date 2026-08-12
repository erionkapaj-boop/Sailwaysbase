-- ============================================================================
-- Curated port list (landing brief §3).
--
-- Adds `tier` and `active` so display order comes from the data rather than a
-- hardcoded list in the UI, then reconciles the seeded ports with the briefed
-- list.
--
-- Out-of-scope ports are DEACTIVATED, never deleted: skipper_coverage_areas,
-- booking_requests and bookings all hold ports(id) foreign keys, so deleting
-- a port that any skipper or booking already references would either fail or
-- destroy history. `active` keeps them referentially intact while removing
-- them from every picker.
--
-- Explicitly excluded per the brief: marinas serving mostly large crewed
-- yachts with permanent crew (Φλοίσβος, Ζέα/Πειραιάς) — wrong profile for the
-- freelance skippers this platform matches.
-- ============================================================================

alter table ports add column if not exists tier text not null default 'secondary'
  check (tier in ('primary', 'secondary'));
alter table ports add column if not exists active boolean not null default true;

-- Everything currently seeded drops out of the pickers unless the briefed
-- list below turns it back on.
update ports set active = false;

-- name is unique, so this both inserts the new ports and corrects the
-- region/tier of ones already present.
insert into ports (name, region, tier, active) values
  -- primary
  ('Άλιμος',              'Αττική',      'primary',   true),
  ('Άγιος Κοσμάς',        'Αττική',      'primary',   true),
  ('Λαύριο',              'Αττική',      'primary',   true),
  ('Λευκάδα',             'Ιόνιο',       'primary',   true),
  ('Κέρκυρα (Γουβιά)',    'Ιόνιο',       'primary',   true),
  ('Πρέβεζα',             'Ιόνιο',       'primary',   true),
  ('Κως',                 'Δωδεκάνησα',  'primary',   true),
  ('Ρόδος',               'Δωδεκάνησα',  'primary',   true),
  ('Βόλος',               'Σποράδες',    'primary',   true),
  ('Σκιάθος',             'Σποράδες',    'primary',   true),
  ('Πάρος',               'Κυκλάδες',    'primary',   true),
  ('Μύκονος',             'Κυκλάδες',    'primary',   true),
  -- secondary (the brief lists these without a region; all four are Cyclades)
  ('Νάξος',               'Κυκλάδες',    'secondary', true),
  ('Σαντορίνη (Βλυχάδα)', 'Κυκλάδες',    'secondary', true),
  ('Μήλος',               'Κυκλάδες',    'secondary', true),
  ('Σύρος',               'Κυκλάδες',    'secondary', true)
on conflict (name) do update
  set region = excluded.region,
      tier   = excluded.tier,
      active = true;

-- The old seed used bare 'Κέρκυρα' and 'Σαντορίνη'; the briefed names specify
-- the marina. Fold the old rows into the new ones where nothing references
-- them, otherwise leave them deactivated so their history survives.
update ports set active = false where name in ('Κέρκυρα', 'Σαντορίνη');

delete from ports p
where p.active = false
  and not exists (select 1 from skipper_coverage_areas c where c.port_id = p.id)
  and not exists (select 1 from booking_requests br where br.port_id = p.id)
  and not exists (select 1 from bookings b where b.port_id = p.id);

create index if not exists ports_active_idx on ports (active, tier, region, name);
