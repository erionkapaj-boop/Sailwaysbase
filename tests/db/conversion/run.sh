#!/usr/bin/env bash
# Η μετατροπή ευρώ → credits (0110) σε βάση με παλιά ευρώ και πράγματα
# ανοιχτά τη στιγμή της μετατροπής, όπως στην παραγωγή.
#
#   bash tests/db/conversion/run.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
db="sf_conv_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$db")
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
createdb "$db"
"${PSQL[@]}" -f tests/db/prelude.sql >/dev/null 2>&1
for f in supabase/migrations/*.sql; do
  [[ "$(basename "$f")" > "0110" ]] && break
  "${PSQL[@]}" -f "$f" >/dev/null 2>&1
done
"${PSQL[@]}" -f tests/db/seed.sql >/dev/null 2>&1
out=$("${PSQL[@]}" -f tests/db/conversion/before.sql 2>&1)
# Όπως στην παραγωγή: πρώτα η νέα τιμή τύπου, μετά το υπόλοιπο 0110.
for f in supabase/migrations/0110*.sql supabase/migrations/011[1-9]*.sql; do
  [ -f "$f" ] && "${PSQL[@]}" -f "$f" >/dev/null 2>&1
done
out+=$'\n'$("${PSQL[@]}" -f tests/db/conversion/after.sql 2>&1)
# Δεύτερη εκτέλεση του 0110: η μετατροπή δεν ξαναγίνεται.
before=$("${PSQL[@]}" -Atc "select sum(wallet_balance) from users")
"${PSQL[@]}" -f supabase/migrations/0110_credits.sql >/dev/null 2>&1
after=$("${PSQL[@]}" -Atc "select sum(wallet_balance) from users")
[ "$before" = "$after" ] && out+=$'\nok   το 0110 ξανά: κανένα υπόλοιπο δεν άλλαξε' || out+=$'\nFAIL το 0110 ξανά άλλαξε υπόλοιπα'
echo "$out" | grep -E "^(ok|FAIL)|ERROR|^==" || true
if grep -qE "^FAIL|ERROR" <<<"$out"; then echo "CONVERSION FAILED"; exit 1; fi
echo "CONVERSION PASSED"
