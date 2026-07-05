using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Versatile.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddApiKeysEncryption : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApiKeysEncrypted",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApiKeysNonce",
                table: "Users",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApiKeysEncrypted",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ApiKeysNonce",
                table: "Users");
        }
    }
}
