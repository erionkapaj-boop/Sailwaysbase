# Skipper App

Αυτόνομο, ανεξάρτητο application για επαγγελματίες Skippers. **Δεν** είναι μέρος του Sail Ways Base Manager (ο φάκελος `skipper-app/` είναι ένα ξεχωριστό project μέσα στο ίδιο repository, με δικό του `package.json` και stack, χωρίς κοινό κώδικα με τη ρίζα του repo). Η αρχιτεκτονική είναι έτοιμη για μελλοντική διασύνδεση με άλλα applications (SkipperFinder, Base Manager) χωρίς αυτή τη σύνδεση να είναι ενεργή σήμερα.

## Stack

- React (Vite) + Tailwind CSS
- Supabase (Postgres + Auth + Storage)
- PWA (vite-plugin-pwa), offline-first caching για δεδομένα ανάγνωσης

## Ανάπτυξη

```bash
cd skipper-app
npm install
cp .env.example .env.local   # συμπλήρωσε VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

## Βάση δεδομένων

Το πλήρες SQL schema (όλες οι ενότητες, multi-user-ready με RLS) βρίσκεται στο [`supabase/schema.sql`](./supabase/schema.sql). Τρέξε το στο Supabase SQL editor του project σου.

Χρειάζεται επίσης ένα public storage bucket με όνομα `avatars` (και αργότερα `charter-photos`) — δημιουργούνται από το Supabase dashboard (Storage). Οδηγίες πολιτικών περιλαμβάνονται ως σχόλια στο schema.

## Στάδιο υλοποίησης

Αυτή είναι η **Φάση 1** από τη συνολική προδιαγραφή: project scaffold, πλήρες SQL schema, Profile, και Dashboard με placeholder τα υπόλοιπα tabs. Οι επόμενες ενότητες (Contacts, Briefing, Inventory, Calendar/Availability, Charters) υλοποιούνται σε επόμενες φάσεις.
