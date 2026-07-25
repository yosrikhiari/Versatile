using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.GroupEdges.Commands;
using Versatile.Application.GroupEdges.Handlers;
using Versatile.Application.GroupEdges.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class GroupEdgeCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "group-1",
            TargetGroupId = "group-2",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        result.Should().NotBeNull();
        result.SourceGroupId.Should().Be("group-1");
        result.TargetGroupId.Should().Be("group-2");
        result.RelationshipType.Should().Be("connects");
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateGroupEdgeCommand
            {
                StoryId = Guid.NewGuid(),
                SourceGroupId = "a",
                TargetGroupId = "b",
                RelationshipType = "connects",
                OrganizationId = OrgId,
                UserId = UserId
            }, default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "src-1",
            TargetGroupId = "tgt-1",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var updateHandler = new UpdateGroupEdgeHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateGroupEdgeCommand
        {
            Id = created.Id,
            SourceGroupId = "src-2",
            TargetGroupId = "tgt-2",
            RelationshipType = "links",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        result.SourceGroupId.Should().Be("src-2");
        result.TargetGroupId.Should().Be("tgt-2");
        result.RelationshipType.Should().Be("links");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "src",
            TargetGroupId = "tgt",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var updateHandler = new UpdateGroupEdgeHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateGroupEdgeCommand
        {
            Id = created.Id,
            RelationshipType = "updated-type",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        result.RelationshipType.Should().Be("updated-type");
        result.SourceGroupId.Should().Be("src");
        result.TargetGroupId.Should().Be("tgt");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "del-src",
            TargetGroupId = "del-tgt",
            RelationshipType = "removes",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var deleteHandler = new DeleteGroupEdgeHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteGroupEdgeCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<GroupEdge>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteGroupEdgeHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteGroupEdgeCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsForStory()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "a",
            TargetGroupId = "b",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);
        await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "c",
            TargetGroupId = "d",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var queryHandler = new GetGroupEdgesHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db));
        var result = await queryHandler.Handle(new GetGroupEdgesQuery(story.Id, OrgId, UserId), default);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "find-me",
            TargetGroupId = "target",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var queryHandler = new GetGroupEdgeByIdHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetGroupEdgeByIdQuery(created.Id, OrgId, UserId), default);

        result.SourceGroupId.Should().Be("find-me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetGroupEdgeByIdHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetGroupEdgeByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "src",
            TargetGroupId = "tgt",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new UpdateGroupEdgeHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateGroupEdgeCommand
            {
                Id = created.Id,
                RelationshipType = "Hacked",
                OrganizationId = OrgId,
                UserId = Guid.NewGuid()
            }, default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "src",
            TargetGroupId = "tgt",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new UpdateGroupEdgeHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateGroupEdgeCommand
            {
                Id = created.Id,
                RelationshipType = "Hacked",
                OrganizationId = Guid.NewGuid(),
                UserId = UserId
            }, default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "src",
            TargetGroupId = "tgt",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new DeleteGroupEdgeHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteGroupEdgeCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "src",
            TargetGroupId = "tgt",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new DeleteGroupEdgeHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteGroupEdgeCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "src",
            TargetGroupId = "tgt",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new GetGroupEdgeByIdHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetGroupEdgeByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGroupEdgeHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GroupEdge>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGroupEdgeCommand
        {
            StoryId = story.Id,
            SourceGroupId = "src",
            TargetGroupId = "tgt",
            RelationshipType = "connects",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new GetGroupEdgeByIdHandler(
            new Repository<GroupEdge>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetGroupEdgeByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"GroupEdge_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "GroupEdge Test Story",
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
