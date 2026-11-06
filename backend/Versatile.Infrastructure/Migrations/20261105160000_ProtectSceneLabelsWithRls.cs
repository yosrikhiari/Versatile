using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Versatile.Infrastructure.Data;

#nullable disable

namespace Versatile.Infrastructure.Migrations;

/// <summary>
/// SceneLabels was added after the frozen tenant-policy migrations and was
/// accidentally omitted from their inline table lists. This migration brings
/// the table under the same tenant isolation contract as other user-owned rows.
/// </summary>
[DbContext(typeof(ApplicationDbContext))]
[Migration("20261105160000_ProtectSceneLabelsWithRls")]
public sealed class ProtectSceneLabelsWithRls : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE "SceneLabels" ENABLE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS tenant_isolation ON "SceneLabels";
            CREATE POLICY tenant_isolation ON "SceneLabels"
                FOR ALL
                USING ("OrganizationId" IS NULL OR "OrganizationId" = current_setting('app.organization_id', true)::uuid);
            ALTER TABLE "SceneLabels" FORCE ROW LEVEL SECURITY;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Keep the tenant boundary on downgrade; dropping this policy would
        // turn a version rollback into a cross-tenant data exposure.
    }
}
