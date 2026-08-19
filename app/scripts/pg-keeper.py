"""Embedded Postgres keeper for container/preview environments.

Initializes a PostgreSQL data directory (via the pgserver wheel, which
bundles the server binaries), creates the application database, and holds
the process open. Used only when DATABASE_URL is not provided — production
deployments point DATABASE_URL at Supabase and skip this entirely.

NOTE: PostgreSQL refuses to run as root; the Dockerfile runs this as the
`node` user.
"""
import glob
import os
import subprocess
import sys
import threading

import pgserver

os.environ.setdefault("XDG_RUNTIME_DIR", "/tmp/pgrun")
DATA_DIR = os.environ.get("PGDATA_PATH", "/var/lib/pgdata")
DB_NAME = os.environ.get("PG_DATABASE", "requi")

srv = pgserver.get_server(DATA_DIR, cleanup_mode=None)
uri = srv.get_uri()
print(f"[pg] server up: {uri}", flush=True)

psql_candidates = glob.glob(
    os.path.join(os.path.dirname(pgserver.__file__), "pginstall", "bin", "psql")
)
if not psql_candidates:
    print("[pg] ERROR: bundled psql not found", flush=True)
    sys.exit(1)
psql = psql_candidates[0]

check = subprocess.run(
    [psql, uri, "-tAc", f"SELECT 1 FROM pg_database WHERE datname='{DB_NAME}'"],
    capture_output=True, text=True,
)
if "1" not in (check.stdout or ""):
    create = subprocess.run([psql, uri, "-c", f"CREATE DATABASE {DB_NAME}"], capture_output=True, text=True)
    if create.returncode != 0:
        print(f"[pg] ERROR creating database: {create.stderr}", flush=True)
        sys.exit(1)
    print(f"[pg] database '{DB_NAME}' created", flush=True)
else:
    print(f"[pg] database '{DB_NAME}' exists", flush=True)

print("[pg] READY", flush=True)
threading.Event().wait()
