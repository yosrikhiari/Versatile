using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Services;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Services;

namespace Versatile.Infrastructure.Tests.Data;

/// <summary>
/// Unit tests for <see cref="StoryAccessChecker"/>, the entitlement rule the
/// SignalR hubs enforce on join and generation. In-memory database: the rule
/// is a LINQ predicate, identical on Postgres.
/// </summary>
public class StoryAccessCheckerTests
{
    private static readonly Guid OwnerId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid OtherId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid OrgId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid OtherOrgId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid StoryId = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");

    [Fact]
    public async Task OwnerInOrg_CanAccess()
    {
        using var db = CreateDbContext();
        var checker = new StoryAccessChecker(db);

        (await checker.CanAccessAsync(StoryId, OwnerId, OrgId)).Should().BeTrue();
    }

    [Fact]
    public async Task OtherUser_CannotAccess()
    {
        using var db = CreateDbContext();
        var checker = new StoryAccessChecker(db);

        (await checker.CanAccessAsync(StoryId, OtherId, OrgId)).Should().BeFalse();
    }

    [Fact]
    public async Task OwnerInOtherOrg_CannotAccess()
    {
        using var db = CreateDbContext();
        var checker = new StoryAccessChecker(db);

        (await checker.CanAccessAsync(StoryId, OwnerId, OtherOrgId)).Should().BeFalse();
    }

    [Fact]
    public async Task OwnerWithoutOrg_CanAccess()
    {
        using var db = CreateDbContext();
        var checker = new StoryAccessChecker(db);

        (await checker.CanAccessAsync(StoryId, OwnerId, null)).Should().BeTrue();
    }

    [Fact]
    public async Task MissingStory_CannotAccess()
    {
        using var db = CreateDbContext();
        var checker = new StoryAccessChecker(db);

        (await checker.CanAccessAsync(Guid.NewGuid(), OwnerId, OrgId)).Should().BeFalse();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"StoryAccessTest_{Guid.NewGuid()}")
            .Options;
        var db = new ApplicationDbContext(options, new TestOrganizationContext());
        db.Stories.Add(new Story
        {
            Id = StoryId,
            UserId = OwnerId,
            OrganizationId = OrgId,
            Title = "Owned"
        });
        db.SaveChanges();
        return db;
    }

    private sealed class TestOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
