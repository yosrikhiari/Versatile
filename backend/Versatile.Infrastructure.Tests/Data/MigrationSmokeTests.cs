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
    /// 2026-10-11: AddRowLevelSecurity removed — the file had no Designer, so EF
    /// never discovered it on any database; AddMissingTenantPolicies carries the
    /// real coverage. See AddMissingTenantPolicies remarks.
    /// </summary>
    private static readonly string[] ExpectedMigrations =
    [
        "InitialCreate",
        "AddOrganizationIdIndexes",
        "AddAuditLog",
        "AddBranchesTable",
        "RemoveResearchNotes",
        "AddBranchIdToSectionsAndSubsections",
        "AddApplicationRoleAndForceRls",
        "AddSyncTombstones",
        "AddMissingTenantPolicies",
        "AddTenantEnableRls",
        "AddSceneLabels"
    ];

    /// <summary>
    /// Full EF migration IDs (timestamp + name) that the runtime must
    /// discover. Discovered via <c>IMigrationsAssembly</c> — the same source
    /// <c>MigrateAsync</c> reads — so an undiscoverable file like the old
    /// AddRowLevelSecurity fails here instead of passing the name-based test
    /// above vacuously (found live on 2026-10-11).
    /// </summary>
    private static readonly string[] ExpectedMigrationIds =
    [
        "20260718091852_InitialCreate",
        "20260718104130_AddOrganizationIdIndexes",
        "20260721191936_AddAuditLog",
        "20260722190541_AddBranchesTable",
        "20260723101635_RemoveResearchNotes",
        "20261004144141_AddBranchIdToSectionsAndSubsections",
        "20261009081623_AddApplicationRoleAndForceRls",
        "20261009100214_AddSyncTombstones",
        "20261011092950_AddMissingTenantPolicies",
        "20261011093725_AddTenantEnableRls",
        "20261011102400_AddSceneLabels"
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

    /// <summary>
    /// Regression guard for the 2026-10-11 boot crash: the role migration
    /// enumerated the shared <c>RlsTableSets</c>, so a later table addition
    /// silently rewrote its statements to ALTER a table that did not exist
    /// yet (42P01, whole API crash-looped). Historical migrations must carry
    /// frozen lists; the shared set keeps evolving for app code and tests.
    /// If this fails because the field is gone, the migration was changed to
    /// enumerate shared state again — do not do that.
    /// </summary>
    [Fact]
    public void RoleMigration_CarriesFrozenTableList()
    {
        var field = typeof(Versatile.Infrastructure.Migrations.AddApplicationRoleAndForceRls)
            .GetField("ForcedTables", BindingFlags.NonPublic | BindingFlags.Static);

        field.Should().NotBeNull("the role migration must carry its own frozen table list");
        var tables = (string[])field!.GetValue(null)!;
        tables.Should().HaveCount(34);
        tables.Should().Contain("Branches");
        tables.Should().NotContain("SyncTombstones");
        tables.Should().NotContain("ResearchNotes");
    }

    [Fact]
    public void ModelCanBuild_WithInMemory()
    {
        using var db = CreateDbContext();

        var model = db.Model;
        var entityTypes = model.GetEntityTypes().ToList();

        entityTypes.Should().HaveCountGreaterThanOrEqualTo(36);
    }

    [Fact]
    public void DiscoveredMigrations_MatchExpectedIds()
    {
        // Npgsql provider with a dummy connection string: building the model
        // never opens a connection, but only a relational provider registers
        // IMigrationsAssembly — InMemory has no migrations concept.
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql("Host=localhost;Database=versatile_model_only;Username=model;Password=model")
            .Options;
        using var db = new ApplicationDbContext(options, new TestOrganizationContext());

        var discovered = db.GetService<IMigrationsAssembly>().Migrations.Keys.OrderBy(id => id);

        discovered.Should().BeEquivalentTo(ExpectedMigrationIds.OrderBy(id => id),
            "every expected migration must be discoverable by the EF runtime, not just present as a class");
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
