using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Tests.Data;

/// <summary>
/// Guards the tenant-isolation contract: every <see cref="UserOwnedEntity"/>
/// table must carry the RLS policy with FORCE (see
/// <see cref="RlsTableSets"/>). The model is built against the Npgsql
/// provider with a dummy connection string — building the model never opens
/// a connection, so this suite needs no database.
/// </summary>
public class RlsCoverageTests
{
    private static readonly string[] TenantExemptTables =
    [
        "Users",
        "Organizations",
        "OrganizationMemberships",
        "AuditLog",
        "OutboxMessages",
    ];

    [Fact]
    public void EveryUserOwnedTable_IsForceRlsCovered()
    {
        using var db = CreateNpgsqlModelOnlyContext();

        var userOwnedTables = db.Model.GetEntityTypes()
            .Where(e => typeof(UserOwnedEntity).IsAssignableFrom(e.ClrType))
            .Select(e => e.GetTableName())
            .Where(t => t is not null)
            .Cast<string>()
            .Distinct()
            .OrderBy(t => t)
            .ToList();

        userOwnedTables.Should().NotBeEmpty("the model must contain tenant-owned tables");

        var uncovered = userOwnedTables.Except(RlsTableSets.ForcedTables).ToList();
        uncovered.Should().BeEmpty(
            "every UserOwnedEntity table must be in RlsTableSets.ForcedTables — " +
            "add the RLS policy in a new migration and extend the set, or the table ships unprotected");
    }

    [Fact]
    public void ForcedTables_ContainsBranchesAndStories()
    {
        RlsTableSets.ForcedTables.Should().Contain("Branches", "added after the original RLS migration missed it");
        RlsTableSets.ForcedTables.Should().Contain("Stories", "the top-level tenant table");
    }

    [Fact]
    public void ForcedTables_ExcludesDroppedResearchNotes()
    {
        RlsTableSets.ForcedTables.Should().NotContain("ResearchNotes",
            "the table was dropped by RemoveResearchNotes; forcing RLS on it would fail fresh migrations");
    }

    [Fact]
    public void ForcedTables_HasExpectedSize()
    {
        // The set is a security contract: any silent add/remove must be a
        // deliberate, reviewed change to RlsTableSets.
        RlsTableSets.ForcedTables.Should().HaveCount(34);
    }

    [Fact]
    public void TenantExemptTables_AreNotUserOwned()
    {
        using var db = CreateNpgsqlModelOnlyContext();

        var userOwnedTables = db.Model.GetEntityTypes()
            .Where(e => typeof(UserOwnedEntity).IsAssignableFrom(e.ClrType))
            .Select(e => e.GetTableName())
            .ToList();

        foreach (var exempt in TenantExemptTables)
            userOwnedTables.Should().NotContain(exempt);
    }

    private static ApplicationDbContext CreateNpgsqlModelOnlyContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql("Host=localhost;Database=versatile_model_only;Username=model;Password=model")
            .Options;
        return new ApplicationDbContext(options, new TestOrganizationContext());
    }

    private sealed class TestOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
