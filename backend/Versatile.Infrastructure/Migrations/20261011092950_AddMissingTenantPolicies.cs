using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Versatile.Infrastructure.Migrations
{
    /// <summary>
    /// Backfills the tenant-isolation policies that
    /// <c>20260718105000_AddRowLevelSecurity</c> was supposed to create but
    /// never did: that file had no Designer (no <c>[Migration]</c> attribute),
    /// so EF Core never discovered it — on NO database, ever — while the
    /// name-based smoke test passed vacuously. The dead file is deleted;
    /// coverage lives here, in dated, discoverable form (found live on
    /// 2026-10-11: 35 tables under FORCE RLS with policies on only 2, i.e.
    /// deny-all for the application role).
    ///
    /// Covers the 33 tables the dead file listed minus dropped
    /// <c>ResearchNotes</c>, plus <c>Branches</c> (which has a policy from
    /// the role migration but never got ENABLE — FORCE alone does not imply
    /// it). <c>SyncTombstones</c> carries policy+ENABLE+FORCE from its own
    /// migration. Same predicate everywhere — no behavior change beyond
    /// making the documented isolation real. DROP-then-CREATE keeps re-runs
    /// (and the role migration's FORCE pass) idempotent.
    /// </summary>
    /// <remarks>
    /// Enables RLS as well as forcing it: FORCE alone does NOT imply ENABLE
    /// (verified live on 2026-10-11 — forced-but-disabled tables filter
    /// nothing), and the original ENABLE migration never ran anywhere. Both
    /// flags are set here so coverage is complete regardless of database
    /// history. Frozen inline list, like every migration in this project:
    /// migrations must never enumerate the shared <c>RlsTableSets</c> (see
    /// AddApplicationRoleAndForceRls remarks for the 42P01 this caused).
    /// </remarks>
    public partial class AddMissingTenantPolicies : Migration
    {
        private static readonly string[] Tables =
        [
            "Annotations",
            "AuthorProfiles",
            "BibleEntries",
            "Branches",
            "Chapters",
            "CharacterRelationships",
            "DailyGoals",
            "Entities",
            "Flows",
            "GeneratedStories",
            "GraphEdges",
            "GraphGroups",
            "GroupEdges",
            "Manuscripts",
            "NodePositions",
            "PlotThreads",
            "ResearchChunks",
            "ResearchDocuments",
            "ResearchTags",
            "RevisionComments",
            "Scenes",
            "Sections",
            "SessionArchiveItems",
            "Snapshots",
            "Snippets",
            "SparkHistoryItems",
            "Stories",
            "StoryDocuments",
            "StoryElements",
            "StoryStateSnapshots",
            "Subsections",
            "VoiceProfiles",
            "VolumeEntities",
            "Volumes",
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            foreach (var table in Tables)
            {
                migrationBuilder.Sql($"""
                    ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY;
                    DROP POLICY IF EXISTS tenant_isolation ON "{table}";
                    CREATE POLICY tenant_isolation ON "{table}"
                        FOR ALL
                        USING ("OrganizationId" IS NULL OR "OrganizationId" = current_setting('app.organization_id', true)::uuid);
                    ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY;
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var table in Tables)
            {
                migrationBuilder.Sql($"""
                    DROP POLICY IF EXISTS tenant_isolation ON "{table}";
                    """);
            }
        }
    }
}
