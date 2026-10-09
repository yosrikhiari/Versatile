using Microsoft.EntityFrameworkCore.Migrations;
using Versatile.Infrastructure.Data;

#nullable disable

namespace Versatile.Infrastructure.Migrations
{
    /// <summary>
    /// Least-privilege application role + enforced tenant isolation.
    ///
    /// What this does:
    ///   1. Ensures the <c>versatile_app</c> LOGIN role exists (no password
    ///      here — the password is provisioned at startup from configuration
    ///      by <c>Program.EnsureAppRoleAsync</c> and, for fresh volumes, by
    ///      <c>backend/postgres-init/01-app-role.sh</c>. Secrets never live in
    ///      migration source).
    ///   2. Grants the role exactly DML on the public schema (present and
    ///      future tables/sequences via ALTER DEFAULT PRIVILEGES, role-agnostic
    ///      so it holds whoever owns the tables). No DDL, no CREATE.
    ///   3. Adds the tenant policy to <c>Branches</c> (a UserOwnedEntity table
    ///      the original RLS migration missed) with the same predicate.
    ///   4. Applies FORCE ROW LEVEL SECURITY to every table in
    ///      <see cref="RlsTableSets.ForcedTables"/> so policies also bind
    ///      table owners — previously the compose superuser connection
    ///      bypassed every policy silently.
    ///
    /// Idempotency: every statement is re-runnable (DO ... IF NOT EXISTS,
    /// DROP POLICY IF EXISTS, plain GRANT/ALTER). Safe on fresh databases
    /// (policies stack on top of AddRowLevelSecurity) and on existing ones.
    /// The tenant predicate is unchanged — rows with NULL OrganizationId keep
    /// the same visibility as before (see RlsCoverageTests and DEPLOYMENT.md).
    /// </summary>
    public partial class AddApplicationRoleAndForceRls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'versatile_app') THEN
                        CREATE ROLE versatile_app WITH LOGIN;
                    ELSE
                        ALTER ROLE versatile_app WITH LOGIN;
                    END IF;
                END
                $$;
                """);

            migrationBuilder.Sql("""
                GRANT USAGE ON SCHEMA public TO versatile_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO versatile_app;
                GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO versatile_app;
                ALTER DEFAULT PRIVILEGES IN SCHEMA public
                    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO versatile_app;
                ALTER DEFAULT PRIVILEGES IN SCHEMA public
                    GRANT USAGE, SELECT ON SEQUENCES TO versatile_app;
                REVOKE CREATE ON SCHEMA public FROM versatile_app;
                """);

            migrationBuilder.Sql("""
                DROP POLICY IF EXISTS tenant_isolation ON "Branches";
                CREATE POLICY tenant_isolation ON "Branches"
                    FOR ALL
                    USING ("OrganizationId" IS NULL OR "OrganizationId" = current_setting('app.organization_id', true)::uuid);
                """);

            foreach (var table in RlsTableSets.ForcedTables)
            {
                migrationBuilder.Sql($"""
                    ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY;
                    """);
            }
        }

        /// <summary>
        /// Downgrade removes the enforcement (FORCE) and the Branches policy
        /// added here, but deliberately keeps the role and its grants: dropping
        /// a role that may own default privileges or hold grants strands the
        /// database. The original AddRowLevelSecurity policies stay enabled.
        /// </summary>
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var table in RlsTableSets.ForcedTables)
            {
                migrationBuilder.Sql($"""
                    ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY;
                    """);
            }

            migrationBuilder.Sql("""
                DROP POLICY IF EXISTS tenant_isolation ON "Branches";
                """);
        }
    }
}
