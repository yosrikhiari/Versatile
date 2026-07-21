using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Infrastructure.Tests.Repositories;

public class RepositoryTests : IDisposable
{
    private readonly ApplicationDbContext _db;
    private readonly IOrganizationContext _orgCtx;

    public RepositoryTests()
    {
        _orgCtx = new NullOrganizationContext();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"RepoTest_{Guid.NewGuid()}")
            .Options;
        _db = new ApplicationDbContext(options, _orgCtx);
    }

    public void Dispose() => _db.Dispose();

    // ---- Repository<T> CRUD ----

    [Fact]
    public async Task AddAsync_EntityIsPersisted()
    {
        var repo = new Repository<Organization>(_db);
        var org = CreateOrganization("Test Org", "test-org");

        await repo.AddAsync(org);
        await _db.SaveChangesAsync();

        var saved = await _db.Organizations.FindAsync(org.Id);
        saved.Should().NotBeNull();
        saved!.Name.Should().Be("Test Org");
    }

    [Fact]
    public async Task GetByIdAsync_ReturnsMatchingEntity()
    {
        var repo = new Repository<Organization>(_db);
        var org = CreateOrganization("Get Org", "get-org");
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();

        var result = await repo.GetByIdAsync(org.Id);

        result.Should().NotBeNull();
        result!.Name.Should().Be("Get Org");
    }

    [Fact]
    public async Task GetByIdAsync_Nonexistent_ReturnsNull()
    {
        var repo = new Repository<Organization>(_db);

        var result = await repo.GetByIdAsync(Guid.NewGuid());

        result.Should().BeNull();
    }

    [Fact]
    public async Task GetAllAsync_ReturnsAllEntities()
    {
        var repo = new Repository<Organization>(_db);
        _db.Organizations.Add(CreateOrganization("A", "a"));
        _db.Organizations.Add(CreateOrganization("B", "b"));
        await _db.SaveChangesAsync();

        var results = await repo.GetAllAsync();

        results.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetAllAsync_WithFilter_ReturnsFiltered()
    {
        var repo = new Repository<Organization>(_db);
        _db.Organizations.Add(CreateOrganization("Alpha", "alpha"));
        _db.Organizations.Add(CreateOrganization("Beta", "beta"));
        await _db.SaveChangesAsync();

        var results = await repo.GetAllAsync(o => o.Slug == "alpha");

        results.Should().ContainSingle(o => o.Name == "Alpha");
    }

    [Fact]
    public async Task Update_SavesChanges()
    {
        var repo = new Repository<Organization>(_db);
        var org = CreateOrganization("Before", "before");
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        org.Name = "After";
        repo.Update(org);
        await _db.SaveChangesAsync();

        var saved = await _db.Organizations.FindAsync(org.Id);
        saved!.Name.Should().Be("After");
    }

    [Fact]
    public async Task Delete_RemovesEntity()
    {
        var repo = new Repository<Organization>(_db);
        var org = CreateOrganization("Delete Me", "delete-me");
        _db.Organizations.Add(org);
        await _db.SaveChangesAsync();

        repo.Delete(org);
        await _db.SaveChangesAsync();

        var saved = await _db.Organizations.FindAsync(org.Id);
        saved.Should().BeNull();
    }

    [Fact]
    public async Task CountAsync_ReturnsCorrectCount()
    {
        var repo = new Repository<Organization>(_db);
        _db.Organizations.Add(CreateOrganization("X", "x"));
        _db.Organizations.Add(CreateOrganization("Y", "y"));
        _db.Organizations.Add(CreateOrganization("Z", "z"));
        await _db.SaveChangesAsync();

        var count = await repo.CountAsync();

        count.Should().Be(3);
    }

    [Fact]
    public async Task CountAsync_WithFilter_ReturnsFilteredCount()
    {
        var repo = new Repository<Organization>(_db);
        _db.Organizations.Add(CreateOrganization("X", "x"));
        _db.Organizations.Add(CreateOrganization("Y", "y"));
        _db.Organizations.Add(CreateOrganization("Z", "z"));
        await _db.SaveChangesAsync();

        var count = await repo.CountAsync(o => o.Slug != "y");

        count.Should().Be(2);
    }

    // ---- UserOwnedRepository<T> ----

    [Fact]
    public async Task GetAllForUserAsync_ReturnsOnlyUserEntities()
    {
        var repo = new UserOwnedRepository<Snippet>(_db);
        var userIdA = Guid.NewGuid();
        var userIdB = Guid.NewGuid();
        _db.Snippets.Add(CreateSnippet(userIdA, Guid.NewGuid()));
        _db.Snippets.Add(CreateSnippet(userIdA, Guid.NewGuid()));
        _db.Snippets.Add(CreateSnippet(userIdB, Guid.NewGuid()));
        await _db.SaveChangesAsync();

        var results = await repo.GetAllForUserAsync(userIdA);

        results.Should().HaveCount(2);
        results.Should().OnlyContain(s => s.UserId == userIdA);
    }

    [Fact]
    public async Task GetByIdForUserAsync_OwnedEntity_ReturnsEntity()
    {
        var repo = new UserOwnedRepository<Snippet>(_db);
        var userId = Guid.NewGuid();
        var snippet = CreateSnippet(userId, Guid.NewGuid());
        _db.Snippets.Add(snippet);
        await _db.SaveChangesAsync();

        var result = await repo.GetByIdForUserAsync(snippet.Id, userId);

        result.Should().NotBeNull();
        result!.Id.Should().Be(snippet.Id);
    }

    [Fact]
    public async Task GetByIdForUserAsync_WrongUser_ReturnsNull()
    {
        var repo = new UserOwnedRepository<Snippet>(_db);
        var snippet = CreateSnippet(Guid.NewGuid(), Guid.NewGuid());
        _db.Snippets.Add(snippet);
        await _db.SaveChangesAsync();

        var result = await repo.GetByIdForUserAsync(snippet.Id, Guid.NewGuid());

        result.Should().BeNull();
    }

    [Fact]
    public async Task ExistsForUserAsync_Owned_ReturnsTrue()
    {
        var repo = new UserOwnedRepository<Snippet>(_db);
        var userId = Guid.NewGuid();
        var snippet = CreateSnippet(userId, Guid.NewGuid());
        _db.Snippets.Add(snippet);
        await _db.SaveChangesAsync();

        var exists = await repo.ExistsForUserAsync(snippet.Id, userId);

        exists.Should().BeTrue();
    }

    [Fact]
    public async Task ExistsForUserAsync_WrongUser_ReturnsFalse()
    {
        var repo = new UserOwnedRepository<Snippet>(_db);
        var snippet = CreateSnippet(Guid.NewGuid(), Guid.NewGuid());
        _db.Snippets.Add(snippet);
        await _db.SaveChangesAsync();

        var exists = await repo.ExistsForUserAsync(snippet.Id, Guid.NewGuid());

        exists.Should().BeFalse();
    }

    // ---- OrganizationOwnedRepository<T> ----

    [Fact]
    public async Task GetAllForOrganizationAsync_ReturnsOnlyOrgEntities()
    {
        var orgContext = new FixedOrganizationContext(Guid.NewGuid());
        var anotherOrgId = Guid.NewGuid();
        var db = CreateDbContext(orgContext);
        var repo = new OrganizationOwnedRepository<Snippet>(db);

        db.Snippets.Add(CreateSnippet(Guid.NewGuid(), orgContext.OrganizationId!.Value));
        db.Snippets.Add(CreateSnippet(Guid.NewGuid(), orgContext.OrganizationId!.Value));
        db.Snippets.Add(CreateSnippet(Guid.NewGuid(), anotherOrgId));
        await db.SaveChangesAsync();

        var results = await repo.GetAllForOrganizationAsync(orgContext.OrganizationId!.Value);

        results.Should().HaveCount(2);
        results.Should().OnlyContain(s => s.OrganizationId == orgContext.OrganizationId);
        db.Dispose();
    }

    [Fact]
    public async Task GetByIdForOrganizationAsync_Owned_ReturnsEntity()
    {
        var orgContext = new FixedOrganizationContext(Guid.NewGuid());
        var db = CreateDbContext(orgContext);
        var repo = new OrganizationOwnedRepository<Snippet>(db);
        var snippet = CreateSnippet(Guid.NewGuid(), orgContext.OrganizationId!.Value);
        db.Snippets.Add(snippet);
        await db.SaveChangesAsync();

        var result = await repo.GetByIdForOrganizationAsync(snippet.Id, orgContext.OrganizationId!.Value);

        result.Should().NotBeNull();
        result!.Id.Should().Be(snippet.Id);
        db.Dispose();
    }

    [Fact]
    public async Task GetByIdForOrganizationAsync_WrongOrg_ReturnsNull()
    {
        var orgContext = new FixedOrganizationContext(Guid.NewGuid());
        var db = CreateDbContext(orgContext);
        var repo = new OrganizationOwnedRepository<Snippet>(db);
        var snippet = CreateSnippet(Guid.NewGuid(), orgContext.OrganizationId!.Value);
        db.Snippets.Add(snippet);
        await db.SaveChangesAsync();

        var result = await repo.GetByIdForOrganizationAsync(snippet.Id, Guid.NewGuid());

        result.Should().BeNull();
        db.Dispose();
    }

    // ---- helpers ----

    private static Organization CreateOrganization(string name, string slug) => new()
    {
        Id = Guid.NewGuid(),
        Name = name,
        Slug = slug,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    private static Snippet CreateSnippet(Guid userId, Guid orgId) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        OrganizationId = orgId,
        StoryId = Guid.NewGuid(),
        Word = "test",
        Count = 1,
        LastSeen = DateTime.UtcNow,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
    };

    private ApplicationDbContext CreateDbContext(IOrganizationContext orgContext)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"RepoTest_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, orgContext);
    }

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }

    private sealed class FixedOrganizationContext : IOrganizationContext
    {
        public FixedOrganizationContext(Guid orgId) { OrganizationId = orgId; }
        public Guid? OrganizationId { get; }
        public string? OrganizationRole => "Admin";
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
