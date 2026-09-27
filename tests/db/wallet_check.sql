-- Credits: συμφωνία υπολοίπων με τις κινήσεις — μόνο ανάγνωση. Οι κινήσεις
-- σε € (πριν το 0110) είναι αρχείο και κλείνουν στο μηδέν.
-- Κάθε γραμμή είναι κάτι που δεν στέκει. Μόνο η γραμμή «— σύνολο» = όλα σωστά.
with ledger as (
  select user_id, sum(amount) as total from wallet_transactions where unit = 'credit' group by user_id
),
problems as (
  -- 1. Το υπόλοιπο δεν ισούται με το άθροισμα των κινήσεων.
  select 'υπόλοιπο ≠ κινήσεις' as problem, u.full_name as who,
         format('υπόλοιπο %s, κινήσεις %s, διαφορά %s',
                u.wallet_balance, coalesce(l.total, 0), u.wallet_balance - coalesce(l.total, 0)) as detail
    from users u left join ledger l on l.user_id = u.id
   where u.wallet_balance <> coalesce(l.total, 0)
  union all
  -- 2. Αρνητικό υπόλοιπο.
  select 'αρνητικό υπόλοιπο', full_name, wallet_balance::text from users where wallet_balance < 0
  union all
  -- 2β. Το παλιό ιστορικό σε € πρέπει να κλείνει στο μηδέν.
  select 'ανοιχτό ιστορικό σε €', u.full_name, sum(t.amount)::text
    from wallet_transactions t join users u on u.id = t.user_id
   where t.unit = 'eur' group by u.full_name, t.user_id having sum(t.amount) <> 0
  union all
  -- 3. Ίδια χρέωση ή επιστροφή δύο φορές για το ίδιο αίτημα/κράτηση.
  select 'διπλή κίνηση', u.full_name,
         format('%s × %s (%s η καθεμία)', count(*), t.type, min(t.amount))
    from wallet_transactions t join users u on u.id = t.user_id
   where t.type not in ('deposit', 'adjustment', 'purchase') and t.unit = 'credit'
   group by u.full_name, t.user_id, t.type, t.related_booking_request_id, t.related_booking_id,
            t.related_delivery_role_request_id, t.related_delivery_booking_id
  having count(*) > 1
  union all
  -- 4. Κίνηση με λάθος πρόσημο (χρεώσεις αρνητικές, επιστροφές/καταθέσεις θετικές).
  select 'λάθος πρόσημο', u.full_name, format('%s %s', t.type, t.amount)
    from wallet_transactions t join users u on u.id = t.user_id
   where (t.type in ('request_fee', 'claim_fee') and t.amount > 0)
      or (t.type in ('deposit', 'refund_credit', 'purchase') and t.amount < 0)
  union all
  -- 5. Πληρωμένο αίτημα πελάτη χωρίς την αντίστοιχη χρέωση.
  select 'πληρωμένο αίτημα χωρίς χρέωση', u.full_name, format('αίτημα %s, %s credits', r.id, r.fee_amount)
    from booking_requests r join users u on u.id = r.client_id
   where r.origin = 'client' and r.fee_paid_at is not null and r.fee_amount > 0
     and not exists (select 1 from wallet_transactions t
                      where t.related_booking_request_id = r.id and t.type = 'request_fee')
)
select * from problems
union all
select '— σύνολο',
       (select count(*) from users)::text || ' λογαριασμοί, ' || (select count(*) from wallet_transactions) || ' κινήσεις',
       'σύνολο υπολοίπων ' || (select coalesce(sum(wallet_balance), 0) from users) || ' credits'
order by 1, 2;
