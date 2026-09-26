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
# Each object is 13 hex characters: 7 identify it (hash of kind and name),
# 6 fingerprint its definition. That keeps the query short enough to paste.
# An object missing from production can only be shown by its code;
# tests/db/drift_names.txt maps codes back to names.
psql -X -At -d "$db" -F $'\t' -c "select left(md5(kind || '|' || name), 7), kind, name, left(h, 6) from ($(cat tests/db/fingerprint.sql)) f order by 1" > tests/db/drift_names.txt
blob=$(awk -F'\t' '{ printf "%s%s", $1, $4 }' tests/db/drift_names.txt | fold -w 78)
{
  echo "-- Παραγωγή σε σχέση με τα migrations — μόνο ανάγνωση, δεν αλλάζει τίποτα."
  echo "-- Δημιουργήθηκε από το tests/db/drift_check.sh μετά το $(ls supabase/migrations | tail -1)."
  echo "with blob as (select regexp_replace('"
  echo "$blob"
  echo "', '\\s', '', 'g') s),"
  echo "expected as (select substr(s, i, 7) k, substr(s, i + 7, 6) h from blob, generate_series(1, length(s), 13) i),"
  echo "actual as (select kind, name, left(md5(kind || '|' || name), 7) k, left(h, 6) h from ("
  cat tests/db/fingerprint.sql
  echo ") f)"
  cat <<'SQL'
select coalesce(a.kind, '?') as "είδος", coalesce(a.name, 'κωδικός ' || e.k) as "όνομα",
       case when a.k is null then 'λείπει από την παραγωγή'
            when e.k is null then 'υπάρχει μόνο στην παραγωγή'
            else 'διαφέρει' end as "κατάσταση"
  from expected e full join actual a on a.k = e.k
 where e.h is distinct from a.h
union all
select '— σύνολο', (select count(*) from expected)::text || ' αντικείμενα ελέγχθηκαν', ''
order by 1, 2;
SQL
} > "$out"
echo "wrote $out ($(wc -l < tests/db/drift_names.txt) objects, $(wc -c < "$out") bytes)"
