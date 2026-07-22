using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Stories.Commands;
using Versatile.Application.Stories.Handlers;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Api.Tests.Integration;

public sealed class StoryMultiTenancyIntegrationTests
{
    private static readonly Guid OrgA = Guid.NewGuid();
    private static readonly Guid OrgB = Guid.NewGuid();
    private static readonly Guid UserA = Guid.NewGuid();
    private static readonly Guid UserB = Guid.NewGuid();

    [Fact]
    public async Task UpdateStory_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);

        var handler = new UpdateStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateStoryCommand(story.Id, "Hacked", null, null, null, null, null, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateStory_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);

        var handler = new UpdateStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateStoryCommand(story.Id, "Hacked", null, null, null, null, null, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteStory_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);

        var handler = new DeleteStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteStoryCommand(story.Id, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteStory_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);

        var handler = new DeleteStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteStoryCommand(story.Id, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetStoryByIdQuery_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);

        var handler = new GetStoryByIdHandler(new Repository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetStoryByIdQuery(story.Id, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetStoryByIdQuery_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);

        var handler = new GetStoryByIdHandler(new Repository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetStoryByIdQuery(story.Id, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetStoriesQuery_WrongUserId_ReturnsEmpty()
    {
        var db = CreateDbContext();
        SeedStory(db, OrgA, UserA);

        var handler = new GetStoriesHandler(new Repository<Story>(db));
        var result = await handler.Handle(new GetStoriesQuery(OrgA, UserB), default);

        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task GetStoriesQuery_WrongOrgId_ReturnsEmpty()
    {
        var db = CreateDbContext();
        SeedStory(db, OrgA, UserA);

        var handler = new GetStoriesHandler(new Repository<Story>(db));
        var result = await handler.Handle(new GetStoriesQuery(OrgB, UserA), default);

        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task GetStoriesQuery_OnlyReturnsOwnStories()
    {
        var db = CreateDbContext();
        var myStory = SeedStory(db, OrgA, UserA);
        SeedStory(db, OrgB, UserB);

        var handler = new GetStoriesHandler(new Repository<Story>(db));
        var result = await handler.Handle(new GetStoriesQuery(OrgA, UserA), default);

        result.Items.Should().HaveCount(1);
        result.Items[0].Id.Should().Be(myStory.Id);
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"StoryMultiTenancy_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db, Guid orgId, Guid userId)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Story Isolation Test",
            UserId = userId,
            OrganizationId = orgId
        };
        db.Set<Story>().Add(story);
        db.SaveChanges();
        return story;
    }

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
