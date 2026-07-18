using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Versatile.Infrastructure.Migrations
{
    public partial class AddRowLevelSecurity : Migration
    {
        private static readonly string[] Tables =
        [
            "Annotations",
            "AuthorProfiles",
            "BibleEntries",
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
            "ResearchNotes",
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

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            foreach (var table in Tables)
            {
                migrationBuilder.Sql($$"""
                    ALTER TABLE "{{table}}" ENABLE ROW LEVEL SECURITY;
                """);

                migrationBuilder.Sql($$"""
                    CREATE POLICY tenant_isolation ON "{{table}}"
                        FOR ALL
                        USING ("OrganizationId" IS NULL OR "OrganizationId" = current_setting('app.organization_id', true)::uuid);
                """);
            }
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var table in Tables)
            {
                migrationBuilder.Sql($$"""
                    DROP POLICY IF EXISTS tenant_isolation ON "{{table}}";
                """);

                migrationBuilder.Sql($$"""
                    ALTER TABLE "{{table}}" DISABLE ROW LEVEL SECURITY;
                """);
            }
        }
    }
}
