# ─── Requi Trading — full-stack (React + tRPC/Hono + Drizzle + PostgreSQL) ──
FROM node:20-slim AS build
WORKDIR /app

# install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# copy source and build frontend + server bundle
COPY . .
RUN npm run build

# ─── runtime ────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Embedded Postgres for self-contained preview/demo deployments.
# Production should set DATABASE_URL (e.g. Supabase) — the entrypoint then
# skips the embedded server entirely. Postgres refuses to run as root, so
# the runtime user is `node`.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/pgvenv \
  && /opt/pgvenv/bin/pip install --no-cache-dir pgserver \
  && mkdir -p /var/lib/pgdata /tmp/pgrun \
  && chown -R node:node /var/lib/pgdata /tmp/pgrun

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# Versioned migrations are read from disk at boot (runMigrations) — ship them.
COPY db/migrations ./db/migrations
COPY scripts/pg-keeper.py scripts/docker-entrypoint.sh ./scripts/
RUN chmod +x scripts/docker-entrypoint.sh && chown -R node:node /app

ENV PG_SOCKET_DIR=/var/lib/pgdata \
    PG_DATABASE=requi \
    PG_USER=postgres \
    PGDATA_PATH=/var/lib/pgdata

USER node
EXPOSE 3000
CMD ["bash", "scripts/docker-entrypoint.sh"]
