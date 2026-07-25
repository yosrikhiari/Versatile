using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.GraphGroups.Commands;
using Versatile.Application.GraphGroups.Handlers;
using Versatile.Application.GraphGroups.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class GraphGroupCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Characters",
            Color = "#ff0000",
            Data = "{}",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        result.Should().NotBeNull();
        result.Label.Should().Be("Characters");
        result.Color.Should().Be("#ff0000");
        result.Data.Should().Be("{}");
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Empty",
            Color = "#000",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        result.Data.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateGraphGroupCommand
            {
                StoryId = Guid.NewGuid(),
                Label = "Test",
                Color = "#fff",
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
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Old Label",
            Color = "#fff",
            Data = "{}",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var updateHandler = new UpdateGraphGroupHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateGraphGroupCommand
        {
            Id = created.Id,
            Label = "New Label",
            Color = "#000",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        result.Label.Should().Be("New Label");
        result.Color.Should().Be("#000");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Original",
            Color = "#fff",
            Data = "original-data",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var updateHandler = new UpdateGraphGroupHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateGraphGroupCommand
        {
            Id = created.Id,
            Label = "Only Label Changed",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        result.Label.Should().Be("Only Label Changed");
        result.Color.Should().Be("#fff");
        result.Data.Should().Be("original-data");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "To Delete",
            Color = "#f00",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var deleteHandler = new DeleteGraphGroupHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteGraphGroupCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<GraphGroup>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteGraphGroupHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteGraphGroupCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsForStory()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Group A",
            Color = "#f00",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);
        await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Group B",
            Color = "#0f0",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var queryHandler = new GetGraphGroupsHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db));
        var result = await queryHandler.Handle(new GetGraphGroupsQuery(story.Id, OrgId, UserId), default);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Find Me",
            Color = "#00f",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var queryHandler = new GetGraphGroupByIdHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetGraphGroupByIdQuery(created.Id, OrgId, UserId), default);

        result.Label.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetGraphGroupByIdHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetGraphGroupByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Title",
            Color = "#fff",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new UpdateGraphGroupHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateGraphGroupCommand
            {
                Id = created.Id,
                Label = "Hacked",
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
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Title",
            Color = "#fff",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new UpdateGraphGroupHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateGraphGroupCommand
            {
                Id = created.Id,
                Label = "Hacked",
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
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Title",
            Color = "#fff",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new DeleteGraphGroupHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteGraphGroupCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Title",
            Color = "#fff",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new DeleteGraphGroupHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteGraphGroupCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Title",
            Color = "#fff",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new GetGraphGroupByIdHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetGraphGroupByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGraphGroupHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GraphGroup>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGraphGroupCommand
        {
            StoryId = story.Id,
            Label = "Title",
            Color = "#fff",
            OrganizationId = OrgId,
            UserId = UserId
        }, default);

        var handler = new GetGraphGroupByIdHandler(
            new Repository<GraphGroup>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetGraphGroupByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"GraphGroup_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "GraphGroup Test Story",
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
