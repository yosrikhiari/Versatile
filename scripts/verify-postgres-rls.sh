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
FRESH_NAME="verify-pg-fresh-$$"
docker run -d --rm --name "$FRESH_NAME" \
  -e POSTGRES_DB=versatile -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_APP_USER=versatile_app -e POSTGRES_APP_PASSWORD=verify-secret-only \
  -v "$PWD/backend/postgres-init:/docker-entrypoint-initdb.d:ro" \
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
PSQL="docker compose exec -T postgres psql -U postgres -d ${POSTGRES_DB:-versatile} -v ON_ERROR_STOP=1 -tA"

FORCE_OFF=$($PSQL -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('Stories','Branches','Sections','Subsections')
  AND NOT c.relforcerowsecurity;")
[ "$FORCE_OFF" = "0" ] || fail "FORCE RLS missing on $FORCE_OFF of Stories/Branches/Sections/Subsections"
pass "FORCE RLS active on Stories/Branches/Sections/Subsections"

POLICIES=$($PSQL -c "SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation';")
[ "$POLICIES" -ge 34 ] || fail "expected tenant_isolation on >=34 tables, found $POLICIES"
pass "tenant_isolation on $POLICIES tables"

# Shared seed for the checks below: temp org + user (FK targets for Stories).
# Every check runs in one transaction ending in ROLLBACK; the cleanup delete
# afterwards only matters if a check aborts before rolling back.
SEED="INSERT INTO \"Organizations\" (\"Id\",\"CreatedAt\",\"UpdatedAt\",\"Name\",\"Slug\")
  VALUES ('$ORG_A', now(), now(), 'verify', 'verify-org-a') ON CONFLICT (\"Id\") DO NOTHING;
INSERT INTO \"Users\" (\"Id\",\"CreatedAt\",\"UpdatedAt\",\"Username\",\"PasswordHash\")
  VALUES ('$USER_A', now(), now(), 'verify-user', 'x') ON CONFLICT (\"Id\") DO NOTHING;"
CLEANUP="DELETE FROM \"Stories\" WHERE \"Title\" LIKE 'verify-%';
DELETE FROM \"Users\" WHERE \"Username\"='verify-user';
DELETE FROM \"Organizations\" WHERE \"Slug\" LIKE 'verify-%';"

READ_OTHER=$($PSQL -c "BEGIN; $SEED
  INSERT INTO \"Stories\" (\"Id\",\"CreatedAt\",\"UpdatedAt\",\"UserId\",\"OrganizationId\",\"Title\")
    VALUES (gen_random_uuid(), now(), now(), '$USER_A', '$ORG_A', 'verify-a');
  SET LOCAL app.organization_id = '$ORG_B';
  SELECT count(*) FROM \"Stories\" WHERE \"Title\"='verify-a';
ROLLBACK;") || fail "cross-tenant read check errored"
$PSQL -c "$CLEANUP" >/dev/null
[ "$READ_OTHER" = "0" ] || fail "cross-tenant read leaked ($READ_OTHER rows visible to org B)"
pass "cross-tenant read blocked (org B sees 0 rows of org A)"

UPD_OTHER=$($PSQL -c "BEGIN; $SEED
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

# Superuser bypass closed: even the owner, with an org set, sees only that org.
OWNER_SEES=$($PSQL -c "BEGIN; $SEED
  INSERT INTO \"Stories\" (\"Id\",\"CreatedAt\",\"UpdatedAt\",\"UserId\",\"OrganizationId\",\"Title\")
    VALUES (gen_random_uuid(), now(), now(), '$USER_A', '$ORG_A', 'verify-c');
  SET LOCAL app.organization_id = '$ORG_B';
  SELECT count(*) FROM \"Stories\" WHERE \"Title\"='verify-c';
ROLLBACK;") || fail "owner check errored"
$PSQL -c "$CLEANUP" >/dev/null
[ "$OWNER_SEES" = "0" ] || fail "FORCE RLS not applied to owner ($OWNER_SEES rows visible)"
pass "FORCE RLS binds table owner too"

if [ "${1:-}" = "--live" ]; then
  curl -fsS http://localhost:5171/health >/dev/null || fail "/health not OK"
  pass "API /health OK as app role"
fi

echo "All PostgreSQL RLS checks passed."
