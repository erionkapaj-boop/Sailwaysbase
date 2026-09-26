# Εκκρεμότητες που χρειάζονται ενέργεια εκτός κώδικα

Πράγματα που δεν γίνονται μόνο με αλλαγή κώδικα: θέλουν λογαριασμό, κλειδί ή
ρύθμιση σε εξωτερική υπηρεσία. Όταν κάποιο γίνει, σβήνεται από εδώ.

## CAPTCHA στη σύνδεση και την εγγραφή
- Τι χρειάζεται: δωρεάν λογαριασμός Cloudflare → Turnstile → νέο site για το
  domain της εφαρμογής. Δίνει δύο κλειδιά: Site Key (δημόσιο) και Secret Key.
- Πού μπαίνουν: στις μεταβλητές περιβάλλοντος του Vercel
  (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).
- Μετά: προστίθεται το widget στις φόρμες σύνδεσης, εγγραφής και «ξέχασα το PIN»,
  και έλεγχος του token στο server πριν από κάθε αποστολή.

## Πληρωμές με κάρτα μέσα στην εφαρμογή
- Σήμερα χρήματα μπαίνουν στο πορτοφόλι μόνο με το bonus εγγραφής ή όταν ο
  admin πιστώσει χειροκίνητα μια τραπεζική κατάθεση (Admin → Οικονομικά).
- Τι χρειάζεται: λογαριασμός εμπόρου σε πάροχο πληρωμών (π.χ. Viva Wallet ή
  Stripe), με τα στοιχεία της εταιρείας. Δίνει δημόσιο και μυστικό κλειδί και
  ένα webhook secret.
- Μετά: σελίδα «Φόρτιση πορτοφολιού» με κάρτα, και webhook που πιστώνει το
  πορτοφόλι μόνο όταν ο πάροχος επιβεβαιώσει την πληρωμή — ποτέ από τον browser.

## Ειδοποιήσεις με email (κώδικας έτοιμος από το 0103 — θέλει ρύθμιση)
Μέχρι να γίνουν τα παρακάτω δεν στέλνεται τίποτα και δεν χάνεται τίποτα:
ό,τι δημιουργείται περιμένει έως 2 μέρες.
1. **Resend** (δωρεάν έως 100 email/μέρα): λογαριασμός στο resend.com,
   Domains → πρόσθεσε το domain σου και βάλε στο DNS τις εγγραφές που δίνει.
   API Keys → νέο κλειδί (Sending access).
2. **Vercel → Settings → Environment Variables** (Production), μετά Redeploy:
   - `PLATFORM_EMAIL_API_KEY` = το κλειδί του Resend
   - `PLATFORM_EMAIL_FROM` = π.χ. `Sailways <noreply@το-domain-σου>`
   - `CRON_SECRET` = ένα μεγάλο τυχαίο κείμενο (το ίδιο μπαίνει στο βήμα 3)
   - `PLATFORM_PUBLIC_URL` = η διεύθυνση της εφαρμογής, π.χ. `https://το-domain-σου`
   - να υπάρχει ήδη το `PLATFORM_SUPABASE_SERVICE_ROLE_KEY`
3. **Supabase SQL Editor**, με τη διεύθυνση και το CRON_SECRET από πάνω:
   ```sql
   create extension if not exists pg_net;
   select cron.schedule('platform-email-notifications', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://ΤΟ-DOMAIN-ΣΟΥ/api/platform/notify-email',
       headers := jsonb_build_object('Authorization', 'Bearer ΤΟ_CRON_SECRET'),
       body := '{}'::jsonb
     );
   $$);
   ```
Με το ίδιο κλειδί ανοίγει και η επαναφορά κωδικού με email («Ξέχασα το PIN»).

## Αυτόματο backup της βάσης (Free πακέτο Supabase)
Στο Free πακέτο δεν υπάρχουν backups που μπορείς να κατεβάσεις ή να επαναφέρεις.
- Τι χρειάζεται: στο Supabase → Project Settings → Database → Connection string
  (URI, «Session pooler»), και να μπει ως secret `SUPABASE_DB_URL` στο GitHub
  (repo → Settings → Secrets and variables → Actions → New repository secret).
- Μετά: ένα workflow στο GitHub κάνει αντίγραφο κάθε νύχτα και το κρατά 30 μέρες
  (θα το ετοιμάσω μόλις μπει το secret).

## Παρακολούθηση σφαλμάτων (προαιρετικό)
- Τι χρειάζεται: δωρεάν λογαριασμός στο sentry.io → νέο project (Next.js) → DSN.
- Πού μπαίνει: Vercel → Environment Variables → `NEXT_PUBLIC_SENTRY_DSN`.
- Μετά: κάθε σφάλμα που βλέπει χρήστης καταγράφεται και σου στέλνει email.
