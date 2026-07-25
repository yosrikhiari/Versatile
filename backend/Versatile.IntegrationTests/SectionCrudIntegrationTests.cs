using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Section.Commands;
using Versatile.Application.Section.Handlers;
using Versatile.Application.Section.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class SectionCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateSectionCommand(story.Id, "Plot Setup", "Intro", "Once upon a time...", "Draft", "fiction", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.Title.Should().Be("Plot Setup");
        result.Summary.Should().Be("Intro");
        result.Content.Should().Be("Once upon a time...");
        result.Status.Should().Be("Draft");
        result.Tags.Should().Be("fiction");
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateSectionCommand(story.Id, "Title", null, null, null, null, OrgId, UserId), default);

        result.Summary.Should().BeNull();
        result.Content.Should().BeNull();
        result.Status.Should().Be("Draft");
        result.Tags.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSectionCommand(Guid.NewGuid(), "Title", null, null, null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "Original", "Old summary", "Old content", "Draft", "old", OrgId, UserId), default);

        var updateHandler = new UpdateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSectionCommand(created.Id, "Updated", "New summary", "New content", null, "Revised", "new", OrgId, UserId), default);

        result.Title.Should().Be("Updated");
        result.Summary.Should().Be("New summary");
        result.Content.Should().Be("New content");
        result.Status.Should().Be("Revised");
        result.Tags.Should().Be("new");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "Original", "Summary", "Content", "Draft", "tags", OrgId, UserId), default);

        var updateHandler = new UpdateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSectionCommand(created.Id, Title: "Only Title Changed", null, null, null, null, null, OrgId, UserId), default);

        result.Title.Should().Be("Only Title Changed");
        result.Summary.Should().Be("Summary");
        result.Content.Should().Be("Content");
        result.Status.Should().Be("Draft");
        result.Tags.Should().Be("tags");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "To Delete", null, null, null, null, OrgId, UserId), default);

        var deleteHandler = new DeleteSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteSectionCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<Section>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteSectionCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByOrder()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateSectionCommand(story.Id, "B", null, null, null, null, OrgId, UserId), default);
        await Task.Delay(10);
        var second = await createHandler.Handle(new CreateSectionCommand(story.Id, "A", null, null, null, null, OrgId, UserId), default);

        var queryHandler = new GetSectionsHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetSectionsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Equal(first.Id, second.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "Find Me", null, null, null, null, OrgId, UserId), default);

        var queryHandler = new GetSectionByIdHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetSectionByIdQuery(created.Id, OrgId, UserId), default);

        result.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetSectionByIdHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetSectionByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "Title", null, null, null, null, OrgId, UserId), default);

        var handler = new UpdateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSectionCommand(created.Id, "Hacked", null, null, null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "Title", null, null, null, null, OrgId, UserId), default);

        var handler = new UpdateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSectionCommand(created.Id, "Hacked", null, null, null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "Title", null, null, null, null, OrgId, UserId), default);

        var handler = new DeleteSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSectionCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "Title", null, null, null, null, OrgId, UserId), default);

        var handler = new DeleteSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSectionCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "Title", null, null, null, null, OrgId, UserId), default);

        var handler = new GetSectionByIdHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSectionByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSectionHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSectionCommand(story.Id, "Title", null, null, null, null, OrgId, UserId), default);

        var handler = new GetSectionByIdHandler(
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSectionByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Section_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Section Test Story",
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
