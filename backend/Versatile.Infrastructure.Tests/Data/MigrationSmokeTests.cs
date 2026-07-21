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
    [Fact]
    public void AllMigrations_AreDiscoverable()
    {
        var migrationTypes = GetMigrationTypes();

        migrationTypes.Should().HaveCount(3, "expected 3 migrations: InitialCreate, AddOrganizationIdIndexes, AddRowLevelSecurity");
    }

    [Fact]
    public void MigrationCount_IsThree()
    {
        var migrationTypes = GetMigrationTypes();

        migrationTypes.Should().HaveCount(3);
    }

    [Fact]
    public void MigrationNames_AreAsExpected()
    {
        var migrationTypes = GetMigrationTypes()
            .Select(t => t.Name)
            .OrderBy(n => n)
            .ToList();

        migrationTypes.Should().Contain(n => n.Contains("InitialCreate"));
        migrationTypes.Should().Contain(n => n.Contains("AddOrganizationIdIndexes"));
        migrationTypes.Should().Contain(n => n.Contains("AddRowLevelSecurity"));
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
