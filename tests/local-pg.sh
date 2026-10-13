# Τοπικός Postgres 16 για τα τεστ (tests/db, tests/e2e), σε καινούριο περιβάλλον.
#
#   source tests/local-pg.sh            # στήνει (αν λείπει) και ξεκινά τη βάση
#   bash tests/db/run.sh                # μετά τρέχουν τα τεστ κανονικά
#
# Ορίζει PGHOST/PGPORT/PGUSER για το ίδιο shell. Αν ο server τρέχει ήδη, δεν
# κάνει τίποτα. Ο φάκελος της βάσης είναι προσωρινός: στο επόμενο περιβάλλον
# ξαναστήνεται από την αρχή, και τα τεστ φτιάχνουν μόνα τους ό,τι χρειάζονται.
#
# CI = ταξινόμηση en_US (glibc). Για ίδια συμπεριφορά τοπικά (π.χ. για `order by`
# σε κείμενο): SF_PG_LOCALE=en_US.UTF-8 source tests/local-pg.sh, σε καινούριο
# φάκελο (SF_PGDIR). Η γλώσσα φτιάχνεται μόνη της αν λείπει.

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
SF_PGDIR="${SF_PGDIR:-/tmp/sf-pg}"
export PGHOST=/tmp PGPORT="${PGPORT:-55434}" PGUSER=postgres

if ! psql -tAc 'select 1' >/dev/null 2>&1; then
  if [ ! -x "$PGBIN/initdb" ]; then
    echo "Λείπει ο Postgres 16 ($PGBIN). Εγκατάσταση: sudo apt-get install -y postgresql-16" >&2
    return 1 2>/dev/null || exit 1
  fi
  if [ ! -s "$SF_PGDIR/data/PG_VERSION" ]; then
    locale="${SF_PG_LOCALE:-C.UTF-8}"
    if [ "$locale" != "C.UTF-8" ] && ! locale -a | grep -qi "^${locale/UTF-8/utf8}$"; then
      localedef -i "${locale%%.*}" -f UTF-8 "$locale"
    fi
    mkdir -p "$SF_PGDIR" && chown postgres "$SF_PGDIR"
    sudo -u postgres "$PGBIN/initdb" -D "$SF_PGDIR/data" -U postgres --auth=trust \
      --encoding=UTF8 --locale="$locale" >/dev/null
  fi
  sudo -u postgres "$PGBIN/pg_ctl" -D "$SF_PGDIR/data" -l "$SF_PGDIR/log.txt" \
    -o "-p $PGPORT -k /tmp" -w start >/dev/null
fi
