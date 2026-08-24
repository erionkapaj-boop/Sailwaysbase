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

Και οι 7 φάσεις της προδιαγραφής έχουν υλοποιηθεί: scaffold + schema, Professional Contacts, Customer Briefing, Inventory/Checklist, Calendar (Availability & Pricing), Charters (πλήρης φάκελος), και ένα πρώτο polish pass (offline indicator, PWA installability, sync-readiness — δες παρακάτω).

## Ετοιμότητα για μελλοντική σύνδεση με το SkipperFinder (ενότητα 9)

Καμία σύνδεση δεν είναι ενεργή σήμερα — αυτό είναι σκόπιμα εκτός scope. Το data layer είναι ήδη καθαρό και "API-ready" γι' αυτό:

- `availability_periods` (start_date, end_date, price_per_day, is_available) είναι ο πίνακας-πηγή διαθεσιμότητας/τιμών — δεν εξαρτάται από κανένα UI state, οπότε μπορεί να εκτεθεί μελλοντικά μέσω μιας Supabase Edge Function ή REST view χωρίς αλλαγές.
- `charters` έχει `availability_period_id` foreign key, οπότε μια κράτηση "καταναλώνει" αυτόματα την αντίστοιχη περίοδο (βλ. `CharterForm.jsx`) — ο μελλοντικός συγχρονισμός με το SkipperFinder θα μπορεί να διαβάζει αυτή τη σχέση απευθείας αντί να την ξαναϋπολογίζει.
- Όλοι οι πίνακες έχουν `user_id` + RLS, άρα ένα μελλοντικό service-role integration (webhook ή cron από/προς το SkipperFinder) μπορεί να λειτουργήσει per-skipper χωρίς αλλαγές στο access model.
- Καμία λογική διαθεσιμότητας δεν ζει μόνο στο React state· ό,τι εμφανίζεται στο Calendar διαβάζεται απευθείας από τη βάση.

Ο ακριβής μηχανισμός (webhook, polling, Edge Function) θα αποφασιστεί όταν ενεργοποιηθεί η σύνδεση.

## Backlog / ιδέες για επόμενη φάση

Σημειώσεις για μελλοντικές προσθήκες, δεν έχουν υλοποιηθεί ακόμα:

- **Έξοδα ναύλου (charter expenses)** — μέσα στον φάκελο κάθε charter (ενότητα 7), ένα σημείο όπου ο skipper καταγράφει τα έξοδα που πλήρωσε κατά τη διάρκεια του ναύλου και καλύπτονται από τον πελάτη (π.χ. λιμενικά τέλη, ρεύμα/νερό στη μαρίνα, καύσιμα, φαγητό/προμήθειες) — κλασικό APA (Advance Provisioning Allowance) στη ναύλωση σκαφών. Κάθε έξοδο θα έχει περιγραφή, ποσό, ίσως κατηγορία και απόδειξη/φωτογραφία. Στο τέλος του charter ο skipper θα μπορεί να δείξει στον πελάτη μια απλή λίστα/σύνολο με το τι ξοδεύτηκε, ώστε να φαίνεται καθαρά τι είναι δικό του κόστος. Θα χρειαστεί νέος πίνακας `charter_expenses` (charter_id, description, amount, category, receipt photo, created_at) με RLS ίδιας λογικής με τα υπόλοιπα charter-child tables.

## Offline / PWA

- Το app κάνει precache του app shell και NetworkFirst caching στα Supabase requests (`vite.config.js`), οπότε ανοίγει και δείχνει τα τελευταία δεδομένα ακόμα κι όταν δεν υπάρχει σύνδεση.
- Όταν ο browser αναφέρει ότι είσαι offline, εμφανίζεται ένα διακριτικό banner στην κορυφή (`OfflineBanner.jsx`) που εξηγεί ότι νέες αλλαγές δεν θα αποθηκευτούν μέχρι να επανέλθει η σύνδεση — δεν υπάρχει (ακόμα) ουρά offline εγγραφών, οπότε το μήνυμα είναι σκόπιμα ρεαλιστικό.
- Το manifest έχει `standalone` display, 192/512 (+ maskable) εικονίδια και `registerType: 'autoUpdate'`, που καλύπτουν τα βασικά κριτήρια εγκατασιμότητας (installability) σε Android/desktop Chrome· σε iOS Safari χρειάζεται προσθήκη μέσω "Προσθήκη στην Αρχική Οθόνη" (η `apple-touch-icon` υπάρχει ήδη).
