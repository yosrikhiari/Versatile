using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Api.Tests.Data;

public sealed class QueryIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task GetPagedAsync_FirstPage_ReturnsCorrectSlice()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 10);
        var repo = new Repository<Story>(db);

        var (items, total) = await repo.GetPagedAsync(
            s => s.OrganizationId == OrgId, page: 1, pageSize: 3);

        items.Should().HaveCount(3);
        total.Should().Be(10);
    }

    [Fact]
    public async Task GetPagedAsync_LastPage_ReturnsRemainingItems()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 10);
        var repo = new Repository<Story>(db);

        var (items, total) = await repo.GetPagedAsync(
            s => s.OrganizationId == OrgId, page: 4, pageSize: 3);

        items.Should().HaveCount(1);
        total.Should().Be(10);
    }

    [Fact]
    public async Task GetPagedAsync_PageBeyondRange_ReturnsEmpty()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 5);
        var repo = new Repository<Story>(db);

        var (items, total) = await repo.GetPagedAsync(
            s => s.OrganizationId == OrgId, page: 99, pageSize: 10);

        items.Should().BeEmpty();
        total.Should().Be(5);
    }

    [Fact]
    public async Task GetPagedAsync_EmptyFilter_ReturnsAll()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 7);
        var repo = new Repository<Story>(db);

        var (items, total) = await repo.GetPagedAsync(page: 1, pageSize: 20);

        items.Should().HaveCount(7);
        total.Should().Be(7);
    }

    [Fact]
    public async Task GetPagedAsync_NullFilter_ReturnsAll()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 4);
        var repo = new Repository<Story>(db);

        var (items, total) = await repo.GetPagedAsync(null, 1, 20);

        items.Should().HaveCount(4);
        total.Should().Be(4);
    }

    [Fact]
    public async Task GetPagedAsync_ZeroItems_ReturnsEmpty()
    {
        var db = CreateDbContext();
        var repo = new Repository<Story>(db);

        var (items, total) = await repo.GetPagedAsync(
            s => s.OrganizationId == OrgId, page: 1, pageSize: 10);

        items.Should().BeEmpty();
        total.Should().Be(0);
    }

    [Fact]
    public async Task GetPagedAsync_ResultsOrderedById()
    {
        var db = CreateDbContext();
        var ids = SeedStories(db, count: 5);
        var repo = new Repository<Story>(db);

        var (items, _) = await repo.GetPagedAsync(
            s => s.OrganizationId == OrgId, page: 1, pageSize: 10);

        items.Should().BeInAscendingOrder(s => s.Id);
    }

    [Fact]
    public async Task GetAllAsync_WithFilter_ReturnsMatching()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 10);
        var repo = new Repository<Story>(db);

        var results = await repo.GetAllAsync(s => s.Title.StartsWith("Story"));

        results.Should().HaveCount(10);
    }

    [Fact]
    public async Task GetAllAsync_WithFilterNoMatch_ReturnsEmpty()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 3);
        var repo = new Repository<Story>(db);

        var results = await repo.GetAllAsync(s => s.Title == "NonExistent");

        results.Should().BeEmpty();
    }

    [Fact]
    public async Task GetAllAsync_NullFilter_ReturnsAll()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 6);
        var repo = new Repository<Story>(db);

        var results = await repo.GetAllAsync(null);

        results.Should().HaveCount(6);
    }

    [Fact]
    public async Task GetByIdAsync_ExistingId_ReturnsEntity()
    {
        var db = CreateDbContext();
        var ids = SeedStories(db, count: 3);
        var repo = new Repository<Story>(db);

        var result = await repo.GetByIdAsync(ids[1]);

        result.Should().NotBeNull();
        result!.Id.Should().Be(ids[1]);
    }

    [Fact]
    public async Task GetByIdAsync_MissingId_ReturnsNull()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 3);
        var repo = new Repository<Story>(db);

        var result = await repo.GetByIdAsync(Guid.NewGuid());

        result.Should().BeNull();
    }

    [Fact]
    public async Task CountAsync_WithFilter_ReturnsCorrectCount()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 8);
        var repo = new Repository<Story>(db);

        var count = await repo.CountAsync(s => s.OrganizationId == OrgId);

        count.Should().Be(8);
    }

    [Fact]
    public async Task CountAsync_NoFilter_ReturnsAll()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 5);
        var repo = new Repository<Story>(db);

        var count = await repo.CountAsync();

        count.Should().Be(5);
    }

    [Fact]
    public async Task CountAsync_WithMismatchedFilter_ReturnsZero()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 3);
        var otherOrg = Guid.NewGuid();
        var repo = new Repository<Story>(db);

        var count = await repo.CountAsync(s => s.OrganizationId == otherOrg);

        count.Should().Be(0);
    }

    [Fact]
    public async Task GetPagedKeysetAsync_WithoutAfterId_ReturnsFirstPage()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 10);
        var repo = new Repository<Story>(db);

        var (items, hasNext) = await repo.GetPagedKeysetAsync(
            s => s.OrganizationId == OrgId, limit: 3);

        items.Should().HaveCount(3);
        hasNext.Should().BeTrue();
    }

    [Fact]
    public async Task GetPagedKeysetAsync_WithAfterId_ReturnsNextPage()
    {
        var db = CreateDbContext();
        var ids = SeedStories(db, count: 10);
        var repo = new Repository<Story>(db);

        var (firstPage, _) = await repo.GetPagedKeysetAsync(
            s => s.OrganizationId == OrgId, limit: 3);
        var (items, hasNext) = await repo.GetPagedKeysetAsync(
            s => s.OrganizationId == OrgId, limit: 3, afterId: firstPage[^1].Id);

        items.Should().HaveCount(3);
        hasNext.Should().BeTrue();
        items.Should().BeInAscendingOrder(s => s.Id);
    }

    [Fact]
    public async Task GetPagedKeysetAsync_LastKeyset_ReturnsRemainingAndNoNextPage()
    {
        var db = CreateDbContext();
        var ids = SeedStories(db, count: 5);
        var repo = new Repository<Story>(db);

        var (items, hasNext) = await repo.GetPagedKeysetAsync(
            s => s.OrganizationId == OrgId, limit: 10);

        items.Should().HaveCount(5);
        hasNext.Should().BeFalse();
    }

    [Fact]
    public async Task GetPagedKeysetAsync_EmptySet_ReturnsEmpty()
    {
        var db = CreateDbContext();
        var repo = new Repository<Story>(db);

        var (items, hasNext) = await repo.GetPagedKeysetAsync(
            s => s.OrganizationId == OrgId, limit: 10);

        items.Should().BeEmpty();
        hasNext.Should().BeFalse();
    }

    [Fact]
    public async Task GetPagedKeysetAsync_WithOrderBy_RespectsOrdering()
    {
        var db = CreateDbContext();
        var ids = SeedStories(db, count: 10);
        var repo = new Repository<Story>(db);

        var (items, _) = await repo.GetPagedKeysetAsync(
            s => s.OrganizationId == OrgId,
            limit: 5,
            orderBy: q => q.OrderByDescending(e => e.Title));

        items.Select(s => s.Title).Should().BeInDescendingOrder(s => s);
    }

    [Fact]
    public async Task GetPagedKeysetAsync_WithoutFilter_ReturnsAll()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 3);
        var repo = new Repository<Story>(db);

        var (items, hasNext) = await repo.GetPagedKeysetAsync(limit: 10);

        items.Should().HaveCount(3);
        hasNext.Should().BeFalse();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"QueryIntegration_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static List<Guid> SeedStories(ApplicationDbContext db, int count)
    {
        var ids = new List<Guid>();
        for (var i = 1; i <= count; i++)
        {
            var id = Guid.NewGuid();
            ids.Add(id);
            db.Set<Story>().Add(new Story
            {
                Id = id,
                Title = $"Story {i}",
                Premise = $"Premise {i}",
                UserId = UserId,
                OrganizationId = OrgId,
                UpdatedAt = DateTime.UtcNow
            });
        }
        db.SaveChanges();
        return ids;
    }

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
