using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Versatile.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOrganizationIdIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Volumes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Volumes",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "VolumeEntities",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "VolumeEntities",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "VolumeEntities",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "VolumeEntities",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "VoiceProfiles",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "VoiceProfiles",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Subsections",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Subsections",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "StoryStateSnapshots",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "StoryStateSnapshots",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "StoryStateSnapshots",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "StoryStateSnapshots",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "StoryElements",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "StoryElements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "StoryElements",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "StoryElements",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "StoryDocuments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "StoryDocuments",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "SparkHistoryItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "SparkHistoryItems",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "SparkHistoryItems",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Snippets",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Snippets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "Snippets",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Snippets",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Snapshots",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Snapshots",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "Snapshots",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Snapshots",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "SessionArchiveItems",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "SessionArchiveItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "SessionArchiveItems",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "SessionArchiveItems",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Sections",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Sections",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Scenes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Scenes",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "RevisionComments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "RevisionComments",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "RevisionComments",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "ResearchTags",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "ResearchTags",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "ResearchTags",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "ResearchTags",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "ResearchNotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "ResearchNotes",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "ResearchDocuments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "ResearchDocuments",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "ResearchDocuments",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "ResearchChunks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "ResearchChunks",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "ResearchChunks",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "PlotThreads",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "PlotThreads",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "NodePositions",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "NodePositions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "NodePositions",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "NodePositions",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Manuscripts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Manuscripts",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "GroupEdges",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "GroupEdges",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "GroupEdges",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "GroupEdges",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "GraphGroups",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "GraphGroups",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "GraphGroups",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "GraphGroups",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "GraphEdges",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "GraphEdges",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "GraphEdges",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "GraphEdges",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "GeneratedStories",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "GeneratedStories",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "GeneratedStories",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "GeneratedStories",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Flows",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Flows",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Flows",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Entities",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Entities",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "DailyGoals",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "DailyGoals",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "DailyGoals",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "DailyGoals",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "CharacterRelationships",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "CharacterRelationships",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "CharacterRelationships",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Chapters",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Chapters",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "BibleEntries",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "BibleEntries",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "AuthorProfiles",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "AuthorProfiles",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "Annotations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "Annotations",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Annotations",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "IX_Volumes_OrganizationId",
                table: "Volumes",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_VolumeEntities_OrganizationId",
                table: "VolumeEntities",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_VoiceProfiles_OrganizationId",
                table: "VoiceProfiles",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Subsections_OrganizationId",
                table: "Subsections",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_StoryStateSnapshots_OrganizationId",
                table: "StoryStateSnapshots",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_StoryElements_OrganizationId",
                table: "StoryElements",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_StoryDocuments_OrganizationId",
                table: "StoryDocuments",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Stories_OrganizationId",
                table: "Stories",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_SparkHistoryItems_OrganizationId",
                table: "SparkHistoryItems",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Snippets_OrganizationId",
                table: "Snippets",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Snapshots_OrganizationId",
                table: "Snapshots",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_SessionArchiveItems_OrganizationId",
                table: "SessionArchiveItems",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Sections_OrganizationId",
                table: "Sections",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_OrganizationId",
                table: "Scenes",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_RevisionComments_OrganizationId",
                table: "RevisionComments",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_ResearchTags_OrganizationId",
                table: "ResearchTags",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_ResearchNotes_OrganizationId",
                table: "ResearchNotes",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_ResearchDocuments_OrganizationId",
                table: "ResearchDocuments",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_ResearchChunks_OrganizationId",
                table: "ResearchChunks",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_PlotThreads_OrganizationId",
                table: "PlotThreads",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_NodePositions_OrganizationId",
                table: "NodePositions",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Manuscripts_OrganizationId",
                table: "Manuscripts",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupEdges_OrganizationId",
                table: "GroupEdges",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_GraphGroups_OrganizationId",
                table: "GraphGroups",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_GraphEdges_OrganizationId",
                table: "GraphEdges",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_GeneratedStories_OrganizationId",
                table: "GeneratedStories",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Flows_OrganizationId",
                table: "Flows",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Entities_OrganizationId",
                table: "Entities",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_DailyGoals_OrganizationId",
                table: "DailyGoals",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterRelationships_OrganizationId",
                table: "CharacterRelationships",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Chapters_OrganizationId",
                table: "Chapters",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_BibleEntries_OrganizationId",
                table: "BibleEntries",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_AuthorProfiles_OrganizationId",
                table: "AuthorProfiles",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Annotations_OrganizationId",
                table: "Annotations",
                column: "OrganizationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Volumes_OrganizationId",
                table: "Volumes");

            migrationBuilder.DropIndex(
                name: "IX_VolumeEntities_OrganizationId",
                table: "VolumeEntities");

            migrationBuilder.DropIndex(
                name: "IX_VoiceProfiles_OrganizationId",
                table: "VoiceProfiles");

            migrationBuilder.DropIndex(
                name: "IX_Subsections_OrganizationId",
                table: "Subsections");

            migrationBuilder.DropIndex(
                name: "IX_StoryStateSnapshots_OrganizationId",
                table: "StoryStateSnapshots");

            migrationBuilder.DropIndex(
                name: "IX_StoryElements_OrganizationId",
                table: "StoryElements");

            migrationBuilder.DropIndex(
                name: "IX_StoryDocuments_OrganizationId",
                table: "StoryDocuments");

            migrationBuilder.DropIndex(
                name: "IX_Stories_OrganizationId",
                table: "Stories");

            migrationBuilder.DropIndex(
                name: "IX_SparkHistoryItems_OrganizationId",
                table: "SparkHistoryItems");

            migrationBuilder.DropIndex(
                name: "IX_Snippets_OrganizationId",
                table: "Snippets");

            migrationBuilder.DropIndex(
                name: "IX_Snapshots_OrganizationId",
                table: "Snapshots");

            migrationBuilder.DropIndex(
                name: "IX_SessionArchiveItems_OrganizationId",
                table: "SessionArchiveItems");

            migrationBuilder.DropIndex(
                name: "IX_Sections_OrganizationId",
                table: "Sections");

            migrationBuilder.DropIndex(
                name: "IX_Scenes_OrganizationId",
                table: "Scenes");

            migrationBuilder.DropIndex(
                name: "IX_RevisionComments_OrganizationId",
                table: "RevisionComments");

            migrationBuilder.DropIndex(
                name: "IX_ResearchTags_OrganizationId",
                table: "ResearchTags");

            migrationBuilder.DropIndex(
                name: "IX_ResearchNotes_OrganizationId",
                table: "ResearchNotes");

            migrationBuilder.DropIndex(
                name: "IX_ResearchDocuments_OrganizationId",
                table: "ResearchDocuments");

            migrationBuilder.DropIndex(
                name: "IX_ResearchChunks_OrganizationId",
                table: "ResearchChunks");

            migrationBuilder.DropIndex(
                name: "IX_PlotThreads_OrganizationId",
                table: "PlotThreads");

            migrationBuilder.DropIndex(
                name: "IX_NodePositions_OrganizationId",
                table: "NodePositions");

            migrationBuilder.DropIndex(
                name: "IX_Manuscripts_OrganizationId",
                table: "Manuscripts");

            migrationBuilder.DropIndex(
                name: "IX_GroupEdges_OrganizationId",
                table: "GroupEdges");

            migrationBuilder.DropIndex(
                name: "IX_GraphGroups_OrganizationId",
                table: "GraphGroups");

            migrationBuilder.DropIndex(
                name: "IX_GraphEdges_OrganizationId",
                table: "GraphEdges");

            migrationBuilder.DropIndex(
                name: "IX_GeneratedStories_OrganizationId",
                table: "GeneratedStories");

            migrationBuilder.DropIndex(
                name: "IX_Flows_OrganizationId",
                table: "Flows");

            migrationBuilder.DropIndex(
                name: "IX_Entities_OrganizationId",
                table: "Entities");

            migrationBuilder.DropIndex(
                name: "IX_DailyGoals_OrganizationId",
                table: "DailyGoals");

            migrationBuilder.DropIndex(
                name: "IX_CharacterRelationships_OrganizationId",
                table: "CharacterRelationships");

            migrationBuilder.DropIndex(
                name: "IX_Chapters_OrganizationId",
                table: "Chapters");

            migrationBuilder.DropIndex(
                name: "IX_BibleEntries_OrganizationId",
                table: "BibleEntries");

            migrationBuilder.DropIndex(
                name: "IX_AuthorProfiles_OrganizationId",
                table: "AuthorProfiles");

            migrationBuilder.DropIndex(
                name: "IX_Annotations_OrganizationId",
                table: "Annotations");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Volumes");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Volumes");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "VolumeEntities");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "VolumeEntities");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "VolumeEntities");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "VolumeEntities");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "VoiceProfiles");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "VoiceProfiles");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Subsections");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Subsections");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "StoryStateSnapshots");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "StoryStateSnapshots");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "StoryStateSnapshots");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "StoryStateSnapshots");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "StoryElements");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "StoryElements");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "StoryElements");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "StoryElements");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "StoryDocuments");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "StoryDocuments");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "SparkHistoryItems");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "SparkHistoryItems");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "SparkHistoryItems");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Snippets");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Snippets");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Snippets");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Snippets");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Snapshots");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Snapshots");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Snapshots");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Snapshots");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "SessionArchiveItems");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "SessionArchiveItems");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "SessionArchiveItems");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "SessionArchiveItems");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Sections");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Sections");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Scenes");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Scenes");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "RevisionComments");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "RevisionComments");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "RevisionComments");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "ResearchTags");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "ResearchTags");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "ResearchTags");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "ResearchTags");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "ResearchNotes");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "ResearchNotes");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "ResearchDocuments");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "ResearchDocuments");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "ResearchDocuments");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "ResearchChunks");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "ResearchChunks");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "ResearchChunks");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "PlotThreads");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "PlotThreads");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "NodePositions");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "NodePositions");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "NodePositions");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "NodePositions");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Manuscripts");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Manuscripts");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "GroupEdges");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "GroupEdges");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "GroupEdges");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "GroupEdges");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "GraphGroups");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "GraphGroups");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "GraphGroups");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "GraphGroups");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "GraphEdges");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "GraphEdges");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "GraphEdges");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "GraphEdges");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "GeneratedStories");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "GeneratedStories");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "GeneratedStories");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "GeneratedStories");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Flows");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Flows");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Flows");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Entities");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Entities");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "DailyGoals");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "DailyGoals");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "DailyGoals");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "DailyGoals");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "CharacterRelationships");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "CharacterRelationships");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "CharacterRelationships");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Chapters");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Chapters");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "BibleEntries");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "BibleEntries");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "AuthorProfiles");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "AuthorProfiles");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "Annotations");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Annotations");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Annotations");
        }
    }
}
