using System.Reflection;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Tests.Data;

public class DbContextTests
{
    [Fact]
    public void AllDbSets_HaveNonNullQueryable()
    {
        using var db = CreateDbContext();

        var dbSetProperties = typeof(ApplicationDbContext)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.PropertyType.IsGenericType && p.PropertyType.GetGenericTypeDefinition() == typeof(DbSet<>))
            .ToList();

        dbSetProperties.Should().NotBeEmpty();
        foreach (var prop in dbSetProperties)
        {
            var value = prop.GetValue(db);
            value.Should().NotBeNull($"DbSet<{prop.PropertyType.GetGenericArguments()[0].Name}> {prop.Name} should not be null");
        }
    }

    [Fact]
    public void AllEntityTypes_AreRegistered_InModel()
    {
        using var db = CreateDbContext();
        var model = db.Model;

        var entityTypes = model.GetEntityTypes().Select(e => e.ClrType).ToList();

        entityTypes.Should().Contain(typeof(Story));
        entityTypes.Should().Contain(typeof(Chapter));
        entityTypes.Should().Contain(typeof(Scene));
        entityTypes.Should().Contain(typeof(Entity));
        entityTypes.Should().Contain(typeof(Flow));
        entityTypes.Should().Contain(typeof(Research));
        entityTypes.Should().Contain(typeof(BibleEntry));
        entityTypes.Should().Contain(typeof(Versatile.Domain.Entities.Annotation));
        entityTypes.Should().Contain(typeof(AuthorProfile));
        entityTypes.Should().Contain(typeof(CharacterRelationship));
        entityTypes.Should().Contain(typeof(DailyGoal));
        entityTypes.Should().Contain(typeof(GeneratedStory));
        entityTypes.Should().Contain(typeof(GraphEdge));
        entityTypes.Should().Contain(typeof(GraphGroup));
        entityTypes.Should().Contain(typeof(GroupEdge));
        entityTypes.Should().Contain(typeof(Manuscript));
        entityTypes.Should().Contain(typeof(NodePosition));
        entityTypes.Should().Contain(typeof(Organization));
        entityTypes.Should().Contain(typeof(OrganizationMembership));
        entityTypes.Should().Contain(typeof(PlotThread));
        entityTypes.Should().Contain(typeof(ResearchChunk));
        entityTypes.Should().Contain(typeof(ResearchDocument));
        entityTypes.Should().Contain(typeof(ResearchTag));
        entityTypes.Should().Contain(typeof(RevisionComment));
        entityTypes.Should().Contain(typeof(Section));
        entityTypes.Should().Contain(typeof(SessionArchiveItem));
        entityTypes.Should().Contain(typeof(Snapshot));
        entityTypes.Should().Contain(typeof(Snippet));
        entityTypes.Should().Contain(typeof(SparkHistoryItem));
        entityTypes.Should().Contain(typeof(StoryDocument));
        entityTypes.Should().Contain(typeof(StoryElement));
        entityTypes.Should().Contain(typeof(StoryStateSnapshot));
        entityTypes.Should().Contain(typeof(Subsection));
        entityTypes.Should().Contain(typeof(User));
        entityTypes.Should().Contain(typeof(VoiceProfile));
        entityTypes.Should().Contain(typeof(Volume));
        entityTypes.Should().Contain(typeof(VolumeEntity));
    }

    [Fact]
    public void EveryUserOwnedEntity_HasOrganizationIdIndex()
    {
        using var db = CreateDbContext();
        var model = db.Model;

        var userOwnedTypes = model.GetEntityTypes().Where(e =>
            typeof(UserOwnedEntity).IsAssignableFrom(e.ClrType));

        foreach (var entityType in userOwnedTypes)
        {
            var index = entityType.GetIndexes()
                .FirstOrDefault(i => i.Properties.Any(p => p.Name == nameof(UserOwnedEntity.OrganizationId)));

            index.Should().NotBeNull($"Entity {entityType.ClrType.Name} should have an index on OrganizationId");
        }
    }

    [Fact]
    public void TenantQueryFilter_IsAppliedToAllUserOwnedEntities()
    {
        using var db = CreateDbContext();
        var model = db.Model;

        var userOwnedTypes = model.GetEntityTypes().Where(e =>
            typeof(UserOwnedEntity).IsAssignableFrom(e.ClrType));

        foreach (var entityType in userOwnedTypes)
        {
            var queryFilter = entityType.GetDeclaredQueryFilters().FirstOrDefault();
            queryFilter.Should().NotBeNull($"Entity {entityType.ClrType.Name} should have a tenant query filter");
        }
    }

    [Fact]
    public void OrganizationMembership_HasCompositeKey()
    {
        using var db = CreateDbContext();
        var entityType = db.Model.FindEntityType(typeof(OrganizationMembership));

        entityType.Should().NotBeNull();
        var key = entityType!.FindPrimaryKey();
        key.Should().NotBeNull();
        key!.Properties.Select(p => p.Name).Should().BeEquivalentTo(["OrganizationId", "UserId"]);
    }

    [Fact]
    public void User_HasUniqueIndexOnUsernameAndEmail()
    {
        using var db = CreateDbContext();
        var entityType = db.Model.FindEntityType(typeof(User));

        var indexes = entityType!.GetIndexes().ToList();
        indexes.Any(i => i.IsUnique && i.Properties.Any(p => p.Name == nameof(User.Username)))
            .Should().BeTrue("Username should have a unique index");
        indexes.Any(i => i.IsUnique && i.Properties.Any(p => p.Name == nameof(User.Email)))
            .Should().BeTrue("Email should have a unique index");
    }

    [Fact]
    public void Organization_HasUniqueIndexOnSlug()
    {
        using var db = CreateDbContext();
        var entityType = db.Model.FindEntityType(typeof(Organization));

        entityType!.GetIndexes().Any(i => i.IsUnique && i.Properties.Any(p => p.Name == nameof(Organization.Slug)))
            .Should().BeTrue();
    }

    [Fact]
    public void AllForeignKeys_HaveCorrectDeleteBehavior()
    {
        using var db = CreateDbContext();
        var model = db.Model;

        var messages = new List<string>();

        foreach (var entityType in model.GetEntityTypes())
        {
            foreach (var fk in entityType.GetForeignKeys())
            {
                var deleteBehavior = fk.DeleteBehavior;
                var fkDesc = $"{fk.PrincipalEntityType.ClrType.Name} <- {entityType.ClrType.Name}.{string.Join(",", fk.Properties.Select(p => p.Name))}";

                if (fk.IsRequired && deleteBehavior == DeleteBehavior.ClientSetNull)
                {
                    messages.Add($"FK {fkDesc} is required but has ClientSetNull (should be Cascade or Restrict)");
                }
            }
        }

        messages.Should().BeEmpty($"all foreign keys should have appropriate delete behavior: {string.Join("; ", messages)}");
    }

    [Fact]
    public void ModelCanBuild_Successfully()
    {
        using var db = CreateDbContext();
        var model = db.Model;
        model.GetEntityTypes().Should().NotBeEmpty();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"DbContextTest_{Guid.NewGuid()}")
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
