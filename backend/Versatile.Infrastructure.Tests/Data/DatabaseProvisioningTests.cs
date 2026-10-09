using FluentAssertions;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Tests.Data;

/// <summary>
/// Unit tests for the pure (no-I/O) parts of <see cref="DatabaseProvisioning"/>.
/// Password syncing itself runs at startup over the migration connection and
/// is validated by the compose/Postgres verification script, not here.
/// </summary>
public class DatabaseProvisioningTests
{
    [Theory]
    [InlineData("versatile_app")]
    [InlineData("app")]
    [InlineData("_role1")]
    public void IsValidRoleName_AcceptsSafeNames(string roleName)
    {
        DatabaseProvisioning.IsValidRoleName(roleName).Should().BeTrue();
    }

    [Theory]
    [InlineData("")]
    [InlineData("Versatile_App")]
    [InlineData("app-role")]
    [InlineData("app role")]
    [InlineData("app\"; DROP TABLE \"Stories")]
    [InlineData("\"versatile_app\"")]
    [InlineData("versatile_app;")]
    public void IsValidRoleName_RejectsUnsafeNames(string roleName)
    {
        DatabaseProvisioning.IsValidRoleName(roleName).Should().BeFalse();
    }

    [Fact]
    public void BuildPasswordSyncSql_QuotesRoleAndEmbedsLiteral()
    {
        var sql = DatabaseProvisioning.BuildPasswordSyncSql("versatile_app", "'s3cret'");

        sql.Should().Be("ALTER ROLE \"versatile_app\" WITH LOGIN PASSWORD 's3cret';");
    }

    [Fact]
    public void BuildPasswordSyncSql_RejectsMaliciousRoleName()
    {
        var act = () => DatabaseProvisioning.BuildPasswordSyncSql("x\"; DROP TABLE \"Stories", "'pw'");

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void BuildPasswordSyncSql_RejectsEmptyPasswordLiteral()
    {
        var act = () => DatabaseProvisioning.BuildPasswordSyncSql("versatile_app", "  ");

        act.Should().Throw<ArgumentException>();
    }
}
