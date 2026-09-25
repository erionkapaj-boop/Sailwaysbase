#!/usr/bin/env bash
# Builds a throwaway database from nothing: Supabase stand-ins, then every
# migration in order, then the test actors. Used by both test suites.
#
#   bash tests/db/build.sh <database name>
set -euo pipefail
cd "$(dirname "$0")/../.."
db="$1"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$db")

dropdb --if-exists "$db" >/dev/null 2>&1 || true
createdb "$db"
"${PSQL[@]}" -f tests/db/prelude.sql >/dev/null
for f in supabase/migrations/*.sql; do
  if ! out=$("${PSQL[@]}" -f "$f" 2>&1); then
    echo "FAIL migration $f" >&2
    grep -m5 -i error <<<"$out" >&2
    exit 1
  fi
done
"${PSQL[@]}" -f tests/db/seed.sql >/dev/null
