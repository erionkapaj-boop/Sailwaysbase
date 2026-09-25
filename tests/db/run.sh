#!/usr/bin/env bash
# Database test suite.
#
#   bash tests/db/run.sh            # all tests
#   bash tests/db/run.sh security   # only files whose name contains "security"
#
# Needs a Postgres 16 server you can create databases on, reached through the
# usual PG* variables (PGHOST, PGPORT, PGUSER, PGPASSWORD). Nothing is ever
# run against Supabase: every run builds a throwaway database from
# tests/db/prelude.sql + every file in supabase/migrations, in order.
#
# Steps, each of which fails the run on any error:
#   1. build  — all migrations apply cleanly to an empty database
#   2. reapply — the newest migrations can be pasted a second time safely
#   3. tests  — each tests/db/*.test.sql runs in its own fresh copy
#   4. race   — two clients picking a replacement at the same instant
set -uo pipefail
cd "$(dirname "$0")/../.."

export PGUSER="${PGUSER:-postgres}"
BASE="sf_test_base_$$"
FILTER="${1:-}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
failures=0
created=()

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

cleanup() {
  for db in "${created[@]}"; do dropdb --if-exists "$db" >/dev/null 2>&1; done
}
trap cleanup EXIT

newdb() { # newdb <name> [template]
  dropdb --if-exists "$1" >/dev/null 2>&1
  if [ -n "${2:-}" ]; then createdb -T "$2" "$1"; else createdb "$1"; fi
  created+=("$1")
}

echo "== 1. build: prelude + $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') migrations"
created+=("$BASE")
bash tests/db/build.sh "$BASE" || { red "FAIL building the database from migrations"; exit 1; }
green "ok   all migrations apply to an empty database"

echo "== 2. reapply: the newest migrations are safe to run twice"
newdb "${BASE}_reapply" "$BASE"
for f in $(ls supabase/migrations/*.sql | tail -n 3); do
  if out=$("${PSQL[@]}" -d "${BASE}_reapply" -f "$f" 2>&1); then
    green "ok   $(basename "$f") re-applies cleanly"
  else
    red "FAIL $(basename "$f") fails on a second run"; echo "$out" | grep -m3 -i error; failures=$((failures + 1))
  fi
done

echo "== 3. tests"
for t in tests/db/*.test.sql; do
  name=$(basename "$t" .test.sql)
  if [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]]; then continue; fi
  db="${BASE}_${name}"
  newdb "$db" "$BASE"
  out=$(psql -X -d "$db" -f "$t" 2>&1)
  pass=$(grep -c '^ok ' <<<"$out")
  fail=$(grep -c '^FAIL' <<<"$out")
  errs=$(grep -c 'ERROR' <<<"$out")
  if [ "$fail" -eq 0 ] && [ "$errs" -eq 0 ] && [ "$pass" -gt 0 ]; then
    green "ok   $name: $pass checks passed"
  else
    red "FAIL $name: $pass passed, $fail failed, $errs errors"
    grep -E '^FAIL|ERROR' <<<"$out" | head -20
    failures=$((failures + 1))
  fi
  [ -n "${VERBOSE:-}" ] && echo "$out"
done

if [ -z "$FILTER" ] || [[ "race" == *"$FILTER"* ]]; then
  echo "== 4. race: two simultaneous picks for the same trip"
  db="${BASE}_race"
  newdb "$db" "$BASE"
  "${PSQL[@]}" -d "$db" -f tests/db/race_setup.sql >/dev/null || { red "race setup failed"; failures=$((failures + 1)); }
  req=$(psql -X -At -d "$db" -c "select id from booking_requests where origin = 'admin_replacement'")
  for sp in 4 5; do
    psql -X -d "$db" -v req="$req" -v sp="b0000000-0000-0000-0000-00000000000$sp" -f tests/db/race_pick.sql >/tmp/sf_race_$sp.$$ 2>&1 &
  done
  wait
  confirmed=$(psql -X -At -d "$db" -c "select count(*) from bookings where status = 'confirmed' and replaces_booking_id is not null")
  charged=$(psql -X -At -d "$db" -c "select count(*) from wallet_transactions where type = 'claim_fee' and related_booking_request_id = '$req'")
  if [ "$confirmed" = "1" ] && [ "$charged" = "1" ]; then
    green "ok   one winner, one charge"
  else
    red "FAIL race: $confirmed confirmed bookings, $charged charges"; failures=$((failures + 1))
  fi
  rm -f /tmp/sf_race_*.$$
fi

echo
if [ "$failures" -eq 0 ]; then green "ALL DATABASE TESTS PASSED"; else red "$failures FAILED"; fi
exit $(( failures > 0 ))
