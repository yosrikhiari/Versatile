using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Api.Tests.Infrastructure;

public class OrganizationOwnedRepositoryTests
{
    private static readonly Guid OrgA = Guid.NewGuid();
    private static readonly Guid OrgB = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task GetAllForOrganizationAsync_ReturnsOnlyEntitiesForOrg()
    {
        var db = CreateDbContext();
        var repo = new OrganizationOwnedRepository<Story>(db);

        db.Set<Story>().AddRange(
            new Story { Id = Guid.NewGuid(), Title = "A1", UserId = UserId, OrganizationId = OrgA },
            new Story { Id = Guid.NewGuid(), Title = "A2", UserId = UserId, OrganizationId = OrgA },
            new Story { Id = Guid.NewGuid(), Title = "B1", UserId = UserId, OrganizationId = OrgB }
        );
        await db.SaveChangesAsync();

        var result = await repo.GetAllForOrganizationAsync(OrgA);

        result.Should().HaveCount(2);
        result.All(s => s.OrganizationId == OrgA).Should().BeTrue();
    }

    [Fact]
    public async Task GetAllForOrganizationAsync_ReturnsEmpty_WhenNoEntitiesForOrg()
    {
        var db = CreateDbContext();
        var repo = new OrganizationOwnedRepository<Story>(db);

        db.Set<Story>().AddRange(
            new Story { Id = Guid.NewGuid(), Title = "A1", UserId = UserId, OrganizationId = OrgA }
        );
        await db.SaveChangesAsync();

        var result = await repo.GetAllForOrganizationAsync(OrgB);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetAllForOrganizationAsync_OrdersByUpdatedAtDescending()
    {
        var db = CreateDbContext();
        var repo = new OrganizationOwnedRepository<Story>(db);
        var now = DateTime.UtcNow;

        db.Set<Story>().AddRange(
            new Story { Id = Guid.NewGuid(), Title = "Old", UserId = UserId, OrganizationId = OrgA, UpdatedAt = now.AddHours(-2) },
            new Story { Id = Guid.NewGuid(), Title = "New", UserId = UserId, OrganizationId = OrgA, UpdatedAt = now.AddHours(-1) }
        );
        await db.SaveChangesAsync();

        var result = await repo.GetAllForOrganizationAsync(OrgA);

        result[0].Title.Should().Be("New");
        result[1].Title.Should().Be("Old");
    }

    [Fact]
    public async Task GetByIdForOrganizationAsync_ReturnsEntity_WhenBelongsToOrg()
    {
        var db = CreateDbContext();
        var repo = new OrganizationOwnedRepository<Story>(db);
        var storyId = Guid.NewGuid();

        db.Set<Story>().Add(
            new Story { Id = storyId, Title = "Test", UserId = UserId, OrganizationId = OrgA }
        );
        await db.SaveChangesAsync();

        var result = await repo.GetByIdForOrganizationAsync(storyId, OrgA);

        result.Should().NotBeNull();
        result!.Title.Should().Be("Test");
    }

    [Fact]
    public async Task GetByIdForOrganizationAsync_ReturnsNull_WhenEntityBelongsToDifferentOrg()
    {
        var db = CreateDbContext();
        var repo = new OrganizationOwnedRepository<Story>(db);
        var storyId = Guid.NewGuid();

        db.Set<Story>().Add(
            new Story { Id = storyId, Title = "Test", UserId = UserId, OrganizationId = OrgA }
        );
        await db.SaveChangesAsync();

        var result = await repo.GetByIdForOrganizationAsync(storyId, OrgB);

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetByIdForOrganizationAsync_ReturnsNull_WhenEntityDoesNotExist()
    {
        var db = CreateDbContext();
        var repo = new OrganizationOwnedRepository<Story>(db);

        var result = await repo.GetByIdForOrganizationAsync(Guid.NewGuid(), OrgA);

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetByIdForOrganizationAsync_ReturnsNull_WhenOrganizationIdIsNull()
    {
        var db = CreateDbContext();
        var repo = new OrganizationOwnedRepository<Story>(db);
        var storyId = Guid.NewGuid();

        db.Set<Story>().Add(
            new Story { Id = storyId, Title = "NoOrg", UserId = UserId, OrganizationId = null }
        );
        await db.SaveChangesAsync();

        var result = await repo.GetByIdForOrganizationAsync(storyId, OrgA);

        result.Should().BeNull();
    }

    private static DbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"OrgRepoTest_{Guid.NewGuid()}")
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
