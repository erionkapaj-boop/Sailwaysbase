#!/usr/bin/env bash
# Browser tests: the real app, in a real browser, against the real schema.
#
#   bash tests/e2e/run.sh
#
# Starts, and stops again when done:
#   - a throwaway database built from supabase/migrations (tests/db/build.sh)
#   - PostgREST on that database  (the genuine REST/RPC layer Supabase uses)
#   - tests/e2e/gateway.mjs       (Supabase-shaped API; only sign-in is faked)
#   - the app itself (next build + next start, or `next dev` with E2E_DEV=1)
#
# Needs: Postgres reachable through PG* variables, Node, and a PostgREST
# binary (POSTGREST_BIN, or `postgrest` on PATH, or it is downloaded).
# Chromium comes from `npx playwright install chromium`, or CHROMIUM_PATH.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
OUT="$ROOT/tests/e2e/output"
mkdir -p "$OUT"

export PGUSER="${PGUSER:-postgres}"
DB="sf_e2e_$$"
APP_PORT="${APP_PORT:-3100}"
GATEWAY_PORT="${GATEWAY_PORT:-54391}"
POSTGREST_PORT="${POSTGREST_PORT:-3391}"
export JWT_SECRET="e2e-secret-e2e-secret-e2e-secret-0123456789"
AUTH_PASSWORD="e2e-authenticator"
pids=()

cleanup() {
  # Each server runs in its own process group (setsid), so this also stops
  # the children they start — `next start` hands off to a next-server child
  # that would otherwise keep the port for the next run.
  for p in "${pids[@]}"; do kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done
  dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for() { # wait_for <url> <what>
  for _ in $(seq 1 120); do
    if curl -s -o /dev/null "$1"; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for $2" >&2
  exit 1
}

# A server left over from an earlier run would answer instead of this one,
# with that run's settings — refuse rather than test the wrong thing.
for port in "$APP_PORT" "$GATEWAY_PORT" "$POSTGREST_PORT"; do
  if curl -s -o /dev/null "http://127.0.0.1:$port/"; then
    echo "port $port is already in use (a leftover server from an earlier run?)" >&2
    exit 1
  fi
done

echo "== database"
bash tests/db/build.sh "$DB"
psql -X -q -d "$DB" -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password '$AUTH_PASSWORD';
  else
    alter role authenticator with login password '$AUTH_PASSWORD';
  end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
SQL

echo "== postgrest"
POSTGREST_BIN="${POSTGREST_BIN:-$(command -v postgrest || true)}"
if [ -z "$POSTGREST_BIN" ]; then
  mkdir -p tests/e2e/.bin
  curl -sSL -o tests/e2e/.bin/postgrest.tar.xz \
    https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar -xf tests/e2e/.bin/postgrest.tar.xz -C tests/e2e/.bin
  POSTGREST_BIN="$ROOT/tests/e2e/.bin/postgrest"
fi
# PostgREST connects over TCP as the authenticator role, like Supabase's does.
DBHOST="${PGHOST:-localhost}"; [[ "$DBHOST" == /* ]] && DBHOST=localhost
cat > "$OUT/postgrest.conf" <<CONF
db-uri = "postgresql://authenticator:$AUTH_PASSWORD@$DBHOST:${PGPORT:-5432}/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = $POSTGREST_PORT
CONF
setsid "$POSTGREST_BIN" "$OUT/postgrest.conf" > "$OUT/postgrest.log" 2>&1 &
pids+=($!)
wait_for "http://127.0.0.1:$POSTGREST_PORT/" "PostgREST"

echo "== gateway"
PGDATABASE="$DB" GATEWAY_PORT=$GATEWAY_PORT POSTGREST_URL="http://127.0.0.1:$POSTGREST_PORT" \
  setsid node tests/e2e/gateway.mjs > "$OUT/gateway.log" 2>&1 &
pids+=($!)
wait_for "http://127.0.0.1:$GATEWAY_PORT/rest/v1/regions" "gateway"

echo "== app"
ANON_KEY=$(node -e "import('./tests/e2e/gateway.mjs').then(m => console.log(m.sign({ role: 'anon', exp: 2000000000 })))")
export NEXT_PUBLIC_PLATFORM_SUPABASE_URL="http://localhost:$GATEWAY_PORT"
export NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY="$ANON_KEY"
# Server routes (change-email, notify-email) talk to the database as
# service_role, through the gateway like the browser does.
export PLATFORM_SUPABASE_SERVICE_ROLE_KEY=$(node -e "import('./tests/e2e/gateway.mjs').then(m => console.log(m.sign({ role: 'service_role', exp: 2000000000 })))")
# Email goes to tests/e2e/email.e2e.mjs's stand-in for Resend, never out.
export PLATFORM_EMAIL_API_KEY="e2e"
export PLATFORM_EMAIL_FROM="Sailways <noreply@example.com>"
export PLATFORM_EMAIL_API_URL="http://127.0.0.1:${EMAIL_CAPTURE_PORT:-54392}/emails"
export EMAIL_CAPTURE_PORT="${EMAIL_CAPTURE_PORT:-54392}"
export CRON_SECRET="e2e-cron-secret"
if [ -n "${E2E_DEV:-}" ]; then
  setsid npx next dev -p "$APP_PORT" > "$OUT/app.log" 2>&1 &
else
  npm run build > "$OUT/build.log" 2>&1 || { tail -30 "$OUT/build.log"; exit 1; }
  setsid npx next start -p "$APP_PORT" > "$OUT/app.log" 2>&1 &
fi
pids+=($!)
wait_for "http://localhost:$APP_PORT/platform/login" "the app"

echo "== browser tests"
cd tests/e2e
status=0
for spec in *.e2e.mjs; do
  echo "-- $spec"
  PGDATABASE="$DB" APP_URL="http://localhost:$APP_PORT" node "$spec" || status=1
done
exit $status
