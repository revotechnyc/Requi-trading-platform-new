#!/bin/bash
# Container entrypoint: bring up embedded Postgres (unless DATABASE_URL
# points to an external database such as Supabase), then start the app.
set -e

if [ -z "$DATABASE_URL" ]; then
  mkdir -p /tmp/pgrun && chmod 700 /tmp/pgrun
  echo "[entrypoint] starting embedded Postgres at $PGDATA_PATH ..."
  /opt/pgvenv/bin/python /app/scripts/pg-keeper.py &

  PSQL=$(ls /opt/pgvenv/lib/python3*/site-packages/pgserver/pginstall/bin/psql 2>/dev/null | head -1)

  # 1) wait for the server socket
  for i in $(seq 1 120); do
    [ -S "$PG_SOCKET_DIR/.s.PGSQL.5432" ] && break
    sleep 1
  done
  if [ ! -S "$PG_SOCKET_DIR/.s.PGSQL.5432" ]; then
    echo "[entrypoint] FATAL: Postgres socket never appeared"
    exit 1
  fi

  # 2) wait until the application database accepts connections
  #    (pg-keeper creates it right after the server comes up)
  for i in $(seq 1 60); do
    if "$PSQL" "postgresql://$PG_USER:@/$PG_DATABASE?host=$PG_SOCKET_DIR" -tAc "select 1" >/dev/null 2>&1; then
      echo "[entrypoint] Postgres ready (database: $PG_DATABASE)"
      break
    fi
    sleep 1
    if [ "$i" = "60" ]; then
      echo "[entrypoint] FATAL: database $PG_DATABASE not reachable"
      exit 1
    fi
  done
fi

exec node dist/boot.js
