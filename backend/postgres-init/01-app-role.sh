#!/bin/sh
# Postgres entrypoint init script (fresh volumes only).
#
# The official postgres image runs /docker-entrypoint-initdb.d/* exactly once,
# when PGDATA is empty — existing volumes (with data) skip this directory
# entirely, so this can never touch an upgraded database. Existing databases
# get the equivalent treatment from the AddApplicationRoleAndForceRls EF
# migration plus startup provisioning (Program.cs), which read the same
# POSTGRES_APP_* variables below.
#
# Creates the least-privilege runtime role and its baseline grants. RLS
# policies and FORCE RLS are owned by EF migrations, not this script, so
# there is exactly one place that defines them (RlsTableSets).
set -eu

: "${POSTGRES_DB:=versatile}"
: "${POSTGRES_APP_USER:=versatile_app}"
: "${POSTGRES_APP_PASSWORD:=versatile_app_local_dev_only}"

# The init process runs as the bootstrap superuser; $POSTGRES_USER is set by
# the image. psql variable substitution (not shell interpolation) carries the
# password so it never appears in a process listing.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v app_user="$POSTGRES_APP_USER" \
  -v app_password="$POSTGRES_APP_PASSWORD" <<'EOSQL'
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') THEN
        EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password');
    ELSE
        EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password');
    END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM :"app_user";
EOSQL
