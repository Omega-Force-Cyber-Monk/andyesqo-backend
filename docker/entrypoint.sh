#!/bin/sh
set -e

# 1. Initialise the bundled Postgres cluster on first boot.
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "Initialising PostgreSQL in $PGDATA"
  mkdir -p "$PGDATA" && chown -R postgres:postgres "$PGDATA"
  su postgres -c "$PG_BIN/initdb -D $PGDATA --auth-local=trust --auth-host=md5 -U postgres" >/dev/null
  FRESH_DB=1
fi

# 2. Start Postgres (localhost only).
su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -o \"-c listen_addresses=127.0.0.1\" -w start"

# 3. Create the app role and database if missing.
if [ "$FRESH_DB" = "1" ]; then
  su postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE $POSTGRES_USER WITH LOGIN PASSWORD '$POSTGRES_PASSWORD';\""
  su postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;\""
fi

# 4. Apply migrations, seed a fresh database.
npx prisma migrate deploy
if [ "$FRESH_DB" = "1" ] && [ "${SEED_ON_START:-true}" = "true" ]; then
  npx prisma db seed || echo "Seed failed, continuing"
fi

# 5. Start the API.
exec node dist/main.js
