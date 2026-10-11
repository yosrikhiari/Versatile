using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Versatile.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSceneLabels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SceneLabels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    SceneTitle = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ReviewerName = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    OverallLabel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DimensionLabelsJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    DimensionScoresJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    WordCount = table.Column<int>(type: "integer", nullable: false),
                    SceneExcerpt = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SceneLabels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SceneLabels_Stories_StoryId",
                        column: x => x.StoryId,
                        principalTable: "Stories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SceneLabels_OrganizationId",
                table: "SceneLabels",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_SceneLabels_ReviewerName",
                table: "SceneLabels",
                column: "ReviewerName");

            migrationBuilder.CreateIndex(
                name: "IX_SceneLabels_StoryId",
                table: "SceneLabels",
                column: "StoryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SceneLabels");
        }
    }
}
