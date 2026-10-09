using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Versatile.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSyncTombstones : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SyncTombstones",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    Table = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RowId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncTombstones", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SyncTombstones_DeletedAt",
                table: "SyncTombstones",
                column: "DeletedAt");

            migrationBuilder.CreateIndex(
                name: "IX_SyncTombstones_OrganizationId",
                table: "SyncTombstones",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_SyncTombstones_StoryId",
                table: "SyncTombstones",
                column: "StoryId");

            // Same tenant predicate as every other synced table (see
            // RlsTableSets): a new table must be born protected, not added to
            // the forced set later.
            migrationBuilder.Sql("""
                ALTER TABLE "SyncTombstones" ENABLE ROW LEVEL SECURITY;
                DROP POLICY IF EXISTS tenant_isolation ON "SyncTombstones";
                CREATE POLICY tenant_isolation ON "SyncTombstones"
                    FOR ALL
                    USING ("OrganizationId" IS NULL OR "OrganizationId" = current_setting('app.organization_id', true)::uuid);
                ALTER TABLE "SyncTombstones" FORCE ROW LEVEL SECURITY;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SyncTombstones");
        }
    }
}
