using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Versatile.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBranchIdToSectionsAndSubsections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                table: "Subsections",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                table: "Sections",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Subsections_BranchId",
                table: "Subsections",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_Sections_BranchId",
                table: "Sections",
                column: "BranchId");

            migrationBuilder.AddForeignKey(
                name: "FK_Sections_Branches_BranchId",
                table: "Sections",
                column: "BranchId",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Subsections_Branches_BranchId",
                table: "Subsections",
                column: "BranchId",
                principalTable: "Branches",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Sections_Branches_BranchId",
                table: "Sections");

            migrationBuilder.DropForeignKey(
                name: "FK_Subsections_Branches_BranchId",
                table: "Subsections");

            migrationBuilder.DropIndex(
                name: "IX_Subsections_BranchId",
                table: "Subsections");

            migrationBuilder.DropIndex(
                name: "IX_Sections_BranchId",
                table: "Sections");

            migrationBuilder.DropColumn(
                name: "BranchId",
                table: "Subsections");

            migrationBuilder.DropColumn(
                name: "BranchId",
                table: "Sections");
        }
    }
}
