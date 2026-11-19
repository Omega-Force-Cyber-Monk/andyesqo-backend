# Single-container image: NestJS API + bundled PostgreSQL.
# NOTE: database data lives inside the container and is lost on restart/redeploy
# unless a persistent disk is mounted at /var/lib/postgresql/data.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql postgresql-contrib ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ENV PG_BIN=/usr/lib/postgresql/15/bin \
    PGDATA=/var/lib/postgresql/data \
    POSTGRES_USER=andyesqo \
    POSTGRES_PASSWORD=andyesqo \
    POSTGRES_DB=andyesqo \
    DATABASE_URL="postgresql://andyesqo:andyesqo@127.0.0.1:5432/andyesqo?schema=public" \
    PORT=10000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p "$PGDATA" /app/uploads /app/var/mail \
  && chown -R postgres:postgres /var/lib/postgresql

EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
