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
# the image.
#
# Verified against postgres:16 (2026-10-11): psql does NOT interpolate :'var'
# inside dollar-quoted DO bodies (arrives literally, errors) and \gexec
# misbehaves after multi-line format() calls, so this script uses neither.
# Everything below is plain SQL with shell interpolation of validated values
# only: the role name must match [a-z_][a-z0-9_]* (else abort), and single
# quotes in the password are doubled (correct SQL string escaping).
case "$POSTGRES_APP_USER" in
  ''|*[!a-z0-9_]*)
    echo "01-app-role.sh: POSTGRES_APP_USER must match [a-z_][a-z0-9_]*, got '$POSTGRES_APP_USER'" >&2
    exit 1
    ;;
esac
if [ -z "${POSTGRES_APP_PASSWORD:-}" ]; then
  echo '01-app-role.sh: refusing to create a passwordless LOGIN role; set POSTGRES_APP_PASSWORD' >&2
  exit 1
fi
pw_esc=$(printf '%s' "$POSTGRES_APP_PASSWORD" | sed "s/'/''/g")

PSQL="psql -v ON_ERROR_STOP=1 --username $POSTGRES_USER --dbname $POSTGRES_DB"
# CREATE fails when the role already exists (image rebuilds against an
# initialized volume should not happen — entrypoint skips them — but stay
# idempotent anyway); the ALTER then converges the password either way.
$PSQL -c "CREATE ROLE \"$POSTGRES_APP_USER\" WITH LOGIN PASSWORD '$pw_esc'" || true
$PSQL -c "ALTER ROLE \"$POSTGRES_APP_USER\" WITH LOGIN PASSWORD '$pw_esc'"
$PSQL <<EOSQL
GRANT USAGE ON SCHEMA public TO "$POSTGRES_APP_USER";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "$POSTGRES_APP_USER";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "$POSTGRES_APP_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$POSTGRES_APP_USER";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO "$POSTGRES_APP_USER";
REVOKE CREATE ON SCHEMA public FROM "$POSTGRES_APP_USER";
EOSQL
