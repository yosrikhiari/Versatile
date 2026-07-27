using System.Reflection;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Tests.Data;

public class MigrationSmokeTests
{
    /// <summary>
    /// The migrations expected to exist, in application order. Add a name here when
    /// you add a migration — an exact-set assertion catches both an accidentally
    /// dropped migration and one added without review, and names what changed.
    /// </summary>
    private static readonly string[] ExpectedMigrations =
    [
        "InitialCreate",
        "AddOrganizationIdIndexes",
        "AddRowLevelSecurity",
        "AddAuditLog",
        "AddBranchesTable",
        "RemoveResearchNotes"
    ];

    [Fact]
    public void AllMigrations_AreDiscoverable()
    {
        var migrationTypes = GetMigrationTypes();

        migrationTypes.Should().NotBeEmpty("the assembly must expose its EF migrations");
    }

    [Fact]
    public void MigrationSet_MatchesExpected()
    {
        var actual = GetMigrationTypes().Select(t => t.Name).OrderBy(n => n);

        actual.Should().BeEquivalentTo(ExpectedMigrations.OrderBy(n => n));
    }

    [Fact]
    public void MigrationNames_AreAsExpected()
    {
        var migrationTypes = GetMigrationTypes()
            .Select(t => t.Name)
            .OrderBy(n => n)
            .ToList();

        foreach (var expected in ExpectedMigrations)
        {
            migrationTypes.Should().Contain(n => n.Contains(expected));
        }
    }

    [Fact]
    public void ModelCanBuild_WithInMemory()
    {
        using var db = CreateDbContext();

        var model = db.Model;
        var entityTypes = model.GetEntityTypes().ToList();

        entityTypes.Should().HaveCountGreaterThanOrEqualTo(36);
    }

    private static Type[] GetMigrationTypes() =>
        typeof(ApplicationDbContext).Assembly
            .GetTypes()
            .Where(t => t.IsAssignableTo(typeof(Migration)) && !t.IsAbstract)
            .ToArray();

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"MigrationTest_{Guid.NewGuid()}")
            .Options;
        var orgContext = new TestOrganizationContext();
        return new ApplicationDbContext(options, orgContext);
    }

    private sealed class TestOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
