#!/bin/sh
# Live PostgreSQL verification for the least-privilege + FORCE RLS change.
#
# NOT run in this environment (no Docker daemon): execute on a Docker host or
# in CI before merge:
#   sh scripts/verify-postgres-rls.sh [--live]
#
# Default mode is SAFE: it starts a throwaway postgres:16 container for the
# fresh-init checks and only runs read-only plus transaction-rolled-back
# checks against the compose stack. It never deletes volumes. Test rows are
# written inside transactions that always ROLLBACK, with a best-effort
# cleanup delete afterwards in case a check aborts mid-transaction.
set -eu

ORG_A=11111111-1111-1111-1111-111111111111
ORG_B=22222222-2222-2222-2222-222222222222
USER_A=33333333-3333-3333-3333-333333333333

fail() { echo "FAIL: $1" >&2; exit 1; }
pass() { echo "PASS: $1"; }

command -v docker >/dev/null 2>&1 || fail "docker CLI not found"

# --- Phase 1: fresh-init on a throwaway container (never touches pgdata) ---
# Bind-mount portability: MSYS/Git-Bash on Windows rewrites absolute POSIX
# paths in docker arguments (breaking both the -v source and container-side
# paths), so resolve the source in OS-native form there.
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*) INIT_SRC="$(pwd -W)/backend/postgres-init" ;;
  *) INIT_SRC="$(pwd)/backend/postgres-init" ;;
esac
FRESH_NAME="verify-pg-fresh-$$"
docker run -d --rm --name "$FRESH_NAME" \
  -e POSTGRES_DB=versatile -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_APP_USER=versatile_app -e POSTGRES_APP_PASSWORD=verify-secret-only \
  -v "$INIT_SRC:/docker-entrypoint-initdb.d:ro" \
  postgres:16-alpine >/dev/null
trap 'docker rm -f "$FRESH_NAME" >/dev/null 2>&1 || true' EXIT INT TERM
i=0
while [ "$i" -lt 30 ]; do
  if docker exec "$FRESH_NAME" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  i=$((i + 1)); sleep 1
done
FRESH_OK=$(docker exec "$FRESH_NAME" psql -U postgres -d versatile -tAc \
  "SELECT rolcanlogin FROM pg_roles WHERE rolname='versatile_app';")
[ "$FRESH_OK" = "t" ] || fail "fresh init did not create LOGIN role versatile_app"
pass "fresh init creates LOGIN role versatile_app"

docker exec "$FRESH_NAME" psql -U postgres -d versatile -tAc \
  "SELECT has_schema_privilege('versatile_app','public','USAGE'), has_schema_privilege('versatile_app','public','CREATE');" \
  | grep -q "t|f" || fail "fresh grants wrong (want USAGE yes, CREATE no)"
pass "fresh grants: USAGE yes, CREATE no"

# --- Phase 2: live compose stack ---
docker compose ps postgres >/dev/null 2>&1 || fail "compose postgres not running (docker compose up -d postgres)"
PSQL="docker compose exec -T postgres psql -U postgres -d ${POSTGRES_DB:-versatile} -v ON_ERROR_STOP=1 -q -tA"

FORCE_OFF=$($PSQL -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('Stories','Branches','Sections','Subsections')
  AND (NOT c.relforcerowsecurity OR NOT c.relrowsecurity);")
[ "$FORCE_OFF" = "0" ] || fail "FORCE+ENABLE RLS missing on $FORCE_OFF of Stories/Branches/Sections/Subsections"
pass "FORCE+ENABLE RLS active on Stories/Branches/Sections/Subsections"

POLICIES=$($PSQL -c "SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation';")
[ "$POLICIES" -ge 35 ] || fail "expected tenant_isolation on >=35 tables, found $POLICIES"
pass "tenant_isolation on $POLICIES tables"

# Shared seed for the checks below: temp org + user (FK targets for Stories).
# The org is SET before writing, exactly like TenantSessionInterceptor does
# per request — without it even same-org INSERTs fail the policy check (the
# FOR ALL policy doubles as the insert check), which is also how the app
# behaves.
# Every check runs in one transaction ending in ROLLBACK; the cleanup delete
# afterwards only matters if a check aborts before rolling back.
SEED="SET LOCAL app.organization_id = '$ORG_A';
INSERT INTO \"Organizations\" (\"Id\",\"CreatedAt\",\"UpdatedAt\",\"Name\",\"Slug\")
  VALUES ('$ORG_A', now(), now(), 'verify', 'verify-org-a') ON CONFLICT (\"Id\") DO NOTHING;
INSERT INTO \"Users\" (\"Id\",\"CreatedAt\",\"UpdatedAt\",\"Username\",\"PasswordHash\")
  VALUES ('$USER_A', now(), now(), 'verify-user', 'x') ON CONFLICT (\"Id\") DO NOTHING;"
CLEANUP="DELETE FROM \"Stories\" WHERE \"Title\" LIKE 'verify-%';
DELETE FROM \"Users\" WHERE \"Username\"='verify-user';
DELETE FROM \"Organizations\" WHERE \"Slug\" LIKE 'verify-%';"

# Behavioral checks run as the APPLICATION role, not the bootstrap superuser:
# PostgreSQL superusers (and BYPASSRLS roles) bypass RLS unconditionally —
# FORCE only binds non-superuser owners. Runtime isolation therefore holds
# through the app-role connection (what the API uses), while the superuser
# migration identity rightly sees everything. Testing isolation as
# superuser can only ever prove deny-all or nothing.
export PGPASSWORD="${POSTGRES_APP_PASSWORD:-versatile_app_local_dev_only}"
APP_PSQL="docker compose exec -T postgres psql -U ${POSTGRES_APP_USER:-versatile_app} -d ${POSTGRES_DB:-versatile} -v ON_ERROR_STOP=1 -q -tA"

NOBYPASS=$($PSQL -c "SELECT count(*) FROM pg_roles WHERE rolname='${POSTGRES_APP_USER:-versatile_app}' AND rolbypassrls;")
[ "$NOBYPASS" = "0" ] || fail "application role has BYPASSRLS (RLS would never bind)"
pass "application role has no BYPASSRLS"

READ_OTHER=$($APP_PSQL -c "BEGIN; $SEED
  INSERT INTO \"Stories\" (\"Id\",\"CreatedAt\",\"UpdatedAt\",\"UserId\",\"OrganizationId\",\"Title\")
    VALUES (gen_random_uuid(), now(), now(), '$USER_A', '$ORG_A', 'verify-a');
  SET LOCAL app.organization_id = '$ORG_B';
  SELECT count(*) FROM \"Stories\" WHERE \"Title\"='verify-a';
ROLLBACK;") || fail "cross-tenant read check errored"
$PSQL -c "$CLEANUP" >/dev/null
[ "$READ_OTHER" = "0" ] || fail "cross-tenant read leaked ($READ_OTHER rows visible to org B)"
pass "cross-tenant read blocked (org B sees 0 rows of org A)"

UPD_OTHER=$($APP_PSQL -c "BEGIN; $SEED
  INSERT INTO \"Stories\" (\"Id\",\"CreatedAt\",\"UpdatedAt\",\"UserId\",\"OrganizationId\",\"Title\")
    VALUES (gen_random_uuid(), now(), now(), '$USER_A', '$ORG_A', 'verify-b');
  SET LOCAL app.organization_id = '$ORG_B';
  WITH u AS (UPDATE \"Stories\" SET \"Title\"='hijacked' WHERE \"Title\"='verify-b' RETURNING 1)
  SELECT count(*) FROM u;
ROLLBACK;") || fail "cross-tenant update check errored"
$PSQL -c "$CLEANUP" >/dev/null
[ "$UPD_OTHER" = "0" ] || fail "cross-tenant update affected $UPD_OTHER rows"
pass "cross-tenant update blocked (0 rows)"

# Least privilege: app role cannot DDL.
if docker compose exec -T postgres psql "host=localhost user=versatile_app password=${POSTGRES_APP_PASSWORD:-versatile_app_local_dev_only} dbname=${POSTGRES_DB:-versatile}" \
    -c 'CREATE TABLE verify_ddl_nope (id int);' 2>/dev/null; then
  fail "versatile_app can CREATE TABLE (should be denied)"
else
  pass "versatile_app denied DDL (CREATE TABLE fails)"
fi

# Positive control: the same org sees its own row (distinguishes isolation
# from deny-all — without this, every block above could pass vacuously).
OWN_SEES=$($APP_PSQL -c "BEGIN; $SEED
  INSERT INTO \"Stories\" (\"Id\",\"CreatedAt\",\"UpdatedAt\",\"UserId\",\"OrganizationId\",\"Title\")
    VALUES (gen_random_uuid(), now(), now(), '$USER_A', '$ORG_A', 'verify-c');
  SET LOCAL app.organization_id = '$ORG_A';
  SELECT count(*) FROM \"Stories\" WHERE \"Title\"='verify-c';
ROLLBACK;") || fail "same-org check errored"
$PSQL -c "$CLEANUP" >/dev/null
[ "$OWN_SEES" = "1" ] || fail "same-org read returned $OWN_SEES rows, want exactly 1 (deny-all?)"
pass "same-org read works (isolation, not deny-all)"

if [ "${1:-}" = "--live" ]; then
  curl -fsS http://localhost:5171/health >/dev/null || fail "/health not OK"
  pass "API /health OK as app role"
fi

echo "All PostgreSQL RLS checks passed."
