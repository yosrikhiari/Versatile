using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Flows.Commands;
using Versatile.Application.Flows.Handlers;
using Versatile.Application.Flows.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class FlowCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Upsert_CreatesNewFlow_WhenNoneExists()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);

        var handler = new UpdateFlowHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Flow>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new UpdateFlowCommand(story.Id, "[\"node1\"]", "[\"edge1\"]", null, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.StoryId.Should().Be(story.Id);
        result.Nodes.Should().Be("[\"node1\"]");
        result.Edges.Should().Be("[\"edge1\"]");
        result.Viewport.Should().BeNull();
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Upsert_UpdatesExistingFlow_WhenAlreadyExists()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);

        var handler = new UpdateFlowHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Flow>(db),
            new UnitOfWork(db));

        await handler.Handle(new UpdateFlowCommand(story.Id, "[\"original\"]", "[\"original-edge\"]", "zoom:1", OrgId, UserId), default);

        var result = await handler.Handle(new UpdateFlowCommand(story.Id, "[\"updated\"]", "[\"updated-edge\"]", "zoom:2", OrgId, UserId), default);

        result.Nodes.Should().Be("[\"updated\"]");
        result.Edges.Should().Be("[\"updated-edge\"]");
        result.Viewport.Should().Be("zoom:2");
    }

    [Fact]
    public async Task Upsert_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();

        var handler = new UpdateFlowHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Flow>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateFlowCommand(Guid.NewGuid(), "[]", "[]", null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Upsert_WithDifferentUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);

        var handler = new UpdateFlowHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Flow>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateFlowCommand(story.Id, "[]", "[]", null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetFlow_ReturnsExistingFlow()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);

        var upsertHandler = new UpdateFlowHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Flow>(db),
            new UnitOfWork(db));
        var created = await upsertHandler.Handle(new UpdateFlowCommand(story.Id, "[\"node\"]", "[\"edge\"]", "zoom:1", OrgId, UserId), default);

        var getHandler = new GetFlowHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Flow>(db));
        var result = await getHandler.Handle(new GetFlowQuery(story.Id, OrgId, UserId), default);

        result.Id.Should().Be(created.Id);
        result.Nodes.Should().Be("[\"node\"]");
        result.Edges.Should().Be("[\"edge\"]");
        result.Viewport.Should().Be("zoom:1");
    }

    [Fact]
    public async Task GetFlow_WithMissingFlow_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);

        var getHandler = new GetFlowHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Flow>(db));

        await FluentActions
            .Awaiting(() => getHandler.Handle(new GetFlowQuery(story.Id, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Flow_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Flow Test Story",
            UserId = UserId,
            OrganizationId = OrgId
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
