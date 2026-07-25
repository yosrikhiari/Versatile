using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.NodePositions.Commands;
using Versatile.Application.NodePositions.Handlers;
using Versatile.Application.NodePositions.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class NodePositionCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 100.5, 200.3, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.NodeId.Should().Be("node-1");
        result.NodeType.Should().Be("character");
        result.X.Should().Be(100.5);
        result.Y.Should().Be(200.3);
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateNodePositionCommand(Guid.NewGuid(), "node-1", "character", 0, 0, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 100, 200, OrgId, UserId), default);

        var updateHandler = new UpdateNodePositionHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateNodePositionCommand(created.Id, "node-2", "location", 300, 400, OrgId, UserId), default);

        result.NodeId.Should().Be("node-2");
        result.NodeType.Should().Be("location");
        result.X.Should().Be(300);
        result.Y.Should().Be(400);
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 100, 200, OrgId, UserId), default);

        var updateHandler = new UpdateNodePositionHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateNodePositionCommand(created.Id, null, "updated-type", null, null, OrgId, UserId), default);

        result.NodeType.Should().Be("updated-type");
        result.NodeId.Should().Be("node-1");
        result.X.Should().Be(100);
        result.Y.Should().Be(200);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 0, 0, OrgId, UserId), default);

        var deleteHandler = new DeleteNodePositionHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteNodePositionCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<NodePosition>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteNodePositionHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteNodePositionCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 0, 0, OrgId, UserId), default);
        var second = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-2", "location", 10, 20, OrgId, UserId), default);

        var queryHandler = new GetNodePositionsHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db));
        var result = await queryHandler.Handle(new GetNodePositionsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Contain(first.Id);
        result.Select(e => e.Id).Should().Contain(second.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "find-me", "character", 50, 75, OrgId, UserId), default);

        var queryHandler = new GetNodePositionByIdHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetNodePositionByIdQuery(created.Id, OrgId, UserId), default);

        result.NodeId.Should().Be("find-me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetNodePositionByIdHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetNodePositionByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 0, 0, OrgId, UserId), default);

        var handler = new UpdateNodePositionHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateNodePositionCommand(created.Id, null, "hacked", null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 0, 0, OrgId, UserId), default);

        var handler = new UpdateNodePositionHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateNodePositionCommand(created.Id, null, "hacked", null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 0, 0, OrgId, UserId), default);

        var handler = new DeleteNodePositionHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteNodePositionCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 0, 0, OrgId, UserId), default);

        var handler = new DeleteNodePositionHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteNodePositionCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 0, 0, OrgId, UserId), default);

        var handler = new GetNodePositionByIdHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetNodePositionByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateNodePositionHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<NodePosition>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateNodePositionCommand(story.Id, "node-1", "character", 0, 0, OrgId, UserId), default);

        var handler = new GetNodePositionByIdHandler(
            new Repository<NodePosition>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetNodePositionByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"NodePosition_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "NodePosition Test Story",
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
