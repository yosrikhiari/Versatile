using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Versatile.Infrastructure.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// Enables (and forces) RLS on every tenant table. Needed because the
    /// ENABLE statements were added to AddMissingTenantPolicies only after
    /// it had already applied on upgraded databases — editing an applied
    /// migration never re-runs, so the correction ships here instead. Every
    /// statement is idempotent (re-running converges), so fresh databases
    /// (which run the full corrected history) and upgraded ones end identical.
    /// </summary>
    /// <remarks>
    /// Frozen inline list, like every migration in this project: migrations
    /// must never enumerate the shared <c>RlsTableSets</c>.
    /// </remarks>
    public partial class AddTenantEnableRls : Migration
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
            "SyncTombstones",
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
                    ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY;
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Keep enforcement on downgrade: removing FORCE re-opens the
            // superuser bypass with no benefit. Policies stay as well.
        }
    }
}
