using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.PlotThreads.Commands;
using Versatile.Application.PlotThreads.Handlers;
using Versatile.Application.PlotThreads.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class PlotThreadCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreatePlotThreadCommand(story.Id, "Main Plot", "active", "Key storyline", 1, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.Title.Should().Be("Main Plot");
        result.Status.Should().Be("active");
        result.Notes.Should().Be("Key storyline");
        result.Order.Should().Be(1);
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreatePlotThreadCommand(story.Id, "Title", "active", null, 0, OrgId, UserId), default);

        result.Notes.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreatePlotThreadCommand(Guid.NewGuid(), "Title", "active", null, 0, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "Original", "active", "Old notes", 1, OrgId, UserId), default);

        var updateHandler = new UpdatePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdatePlotThreadCommand(created.Id, "Updated", "completed", "New notes", 2, OrgId, UserId), default);

        result.Title.Should().Be("Updated");
        result.Status.Should().Be("completed");
        result.Notes.Should().Be("New notes");
        result.Order.Should().Be(2);
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "Original", "active", "Original notes", 1, OrgId, UserId), default);

        var updateHandler = new UpdatePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdatePlotThreadCommand(created.Id, Title: "Only Title Changed", null, null, null, OrgId, UserId), default);

        result.Title.Should().Be("Only Title Changed");
        result.Status.Should().Be("active");
        result.Notes.Should().Be("Original notes");
        result.Order.Should().Be(1);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "To Delete", "active", null, 0, OrgId, UserId), default);

        var deleteHandler = new DeletePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeletePlotThreadCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<PlotThread>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeletePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeletePlotThreadCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "A", "active", null, 0, OrgId, UserId), default);
        var second = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "B", "active", null, 1, OrgId, UserId), default);

        var queryHandler = new GetPlotThreadsHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db));
        var result = await queryHandler.Handle(new GetPlotThreadsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Contain(first.Id);
        result.Select(e => e.Id).Should().Contain(second.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "Find Me", "active", null, 0, OrgId, UserId), default);

        var queryHandler = new GetPlotThreadByIdHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetPlotThreadByIdQuery(created.Id, OrgId, UserId), default);

        result.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetPlotThreadByIdHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetPlotThreadByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "Title", "active", null, 0, OrgId, UserId), default);

        var handler = new UpdatePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdatePlotThreadCommand(created.Id, "Hacked", null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "Title", "active", null, 0, OrgId, UserId), default);

        var handler = new UpdatePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdatePlotThreadCommand(created.Id, "Hacked", null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "Title", "active", null, 0, OrgId, UserId), default);

        var handler = new DeletePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeletePlotThreadCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "Title", "active", null, 0, OrgId, UserId), default);

        var handler = new DeletePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeletePlotThreadCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "Title", "active", null, 0, OrgId, UserId), default);

        var handler = new GetPlotThreadByIdHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetPlotThreadByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreatePlotThreadHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<PlotThread>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreatePlotThreadCommand(story.Id, "Title", "active", null, 0, OrgId, UserId), default);

        var handler = new GetPlotThreadByIdHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetPlotThreadByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"PlotThread_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "PlotThread Test Story",
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
