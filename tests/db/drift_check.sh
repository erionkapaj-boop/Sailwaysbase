#!/usr/bin/env bash
# Writes tests/db/drift_check.sql: a read-only query to paste into the
# Supabase SQL Editor. It carries the fingerprint of the schema that
# supabase/migrations produces and lists only what production has different.
# An empty result (apart from the summary row) means production matches.
#
#   bash tests/db/drift_check.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
db="sf_drift_$$"
trap 'dropdb --if-exists "$db" >/dev/null 2>&1 || true' EXIT
bash tests/db/build.sh "$db"
out=tests/db/drift_check.sql
{
  echo "-- Παραγωγή σε σχέση με τα migrations — μόνο ανάγνωση, δεν αλλάζει τίποτα."
  echo "-- Δημιουργήθηκε από το tests/db/drift_check.sh μετά το $(ls supabase/migrations | tail -1)."
  echo "with expected(kind, name, h) as (values"
  psql -X -At -d "$db" -F $'\t' -c "$(cat tests/db/fingerprint.sql) order by 1, 2" |
    awk -F'\t' '{ gsub(/\x27/, "\x27\x27"); printf "%s(\x27%s\x27, \x27%s\x27, \x27%s\x27)\n", (NR > 1 ? "," : " "), $1, $2, $3 }'
  echo "), actual as ("
  cat tests/db/fingerprint.sql
  echo ")"
  cat <<'SQL'
select coalesce(e.kind, a.kind) as "είδος", coalesce(e.name, a.name) as "όνομα",
       case when a.h is null then 'λείπει από την παραγωγή'
            when e.h is null then 'υπάρχει μόνο στην παραγωγή'
            else 'διαφέρει' end as "κατάσταση"
  from expected e full join actual a on a.kind = e.kind and a.name = e.name
 where e.h is distinct from a.h
union all
select '— σύνολο', (select count(*) from expected)::text || ' αντικείμενα ελέγχθηκαν', ''
order by 1, 2;
SQL
} > "$out"
echo "wrote $out ($(grep -c "^[ ,](" "$out") objects)"
