using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Subsection.Commands;
using Versatile.Application.Subsection.Handlers;
using Versatile.Application.Subsection.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class SubsectionCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var handler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Character Arc", "Intro", "Details about character", "arc", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.Title.Should().Be("Character Arc");
        result.Summary.Should().Be("Intro");
        result.Content.Should().Be("Details about character");
        result.Tags.Should().Be("arc");
        result.StoryId.Should().Be(story.Id);
        result.SectionId.Should().Be(section.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var handler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Title", null, null, null, OrgId, UserId), default);

        result.Summary.Should().BeNull();
        result.Content.Should().BeNull();
        result.Tags.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSubsectionCommand(Guid.NewGuid(), Guid.NewGuid(), "Title", null, null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Create_WithMissingSection_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSubsectionCommand(story.Id, Guid.NewGuid(), "Title", null, null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Create_SectionFromWrongStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var otherStory = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Other",
            UserId = UserId,
            OrganizationId = OrgId
        };
        db.Set<Story>().Add(otherStory);
        var section = SeedSection(db, otherStory.Id);
        var handler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Title", null, null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Original", "Old summary", "Old content", "old", OrgId, UserId), default);

        var updateHandler = new UpdateSubsectionHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSubsectionCommand(created.Id, "Updated", "New summary", "New content", null, "new", OrgId, UserId), default);

        result.Title.Should().Be("Updated");
        result.Summary.Should().Be("New summary");
        result.Content.Should().Be("New content");
        result.Tags.Should().Be("new");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Original", "Summary", "Content", "tags", OrgId, UserId), default);

        var updateHandler = new UpdateSubsectionHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSubsectionCommand(created.Id, Title: "Only Title Changed", null, null, null, null, OrgId, UserId), default);

        result.Title.Should().Be("Only Title Changed");
        result.Summary.Should().Be("Summary");
        result.Content.Should().Be("Content");
        result.Tags.Should().Be("tags");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "To Delete", null, null, null, OrgId, UserId), default);

        var deleteHandler = new DeleteSubsectionHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteSubsectionCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<Subsection>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteSubsectionHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteSubsectionCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByOrder()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "B", null, null, null, OrgId, UserId), default);
        await Task.Delay(10);
        var second = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "A", null, null, null, OrgId, UserId), default);

        var queryHandler = new GetSubsectionsHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetSubsectionsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Equal(first.Id, second.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Find Me", null, null, null, OrgId, UserId), default);

        var queryHandler = new GetSubsectionByIdHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetSubsectionByIdQuery(created.Id, OrgId, UserId), default);

        result.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetSubsectionByIdHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetSubsectionByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Title", null, null, null, OrgId, UserId), default);

        var handler = new UpdateSubsectionHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSubsectionCommand(created.Id, "Hacked", null, null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Title", null, null, null, OrgId, UserId), default);

        var handler = new UpdateSubsectionHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSubsectionCommand(created.Id, "Hacked", null, null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Title", null, null, null, OrgId, UserId), default);

        var handler = new DeleteSubsectionHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSubsectionCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Title", null, null, null, OrgId, UserId), default);

        var handler = new DeleteSubsectionHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSubsectionCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Title", null, null, null, OrgId, UserId), default);

        var handler = new GetSubsectionByIdHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSubsectionByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var section = SeedSection(db, story.Id);
        var createHandler = new CreateSubsectionHandler(
            new Repository<Subsection>(db),
            new Repository<Section>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSubsectionCommand(story.Id, section.Id, "Title", null, null, null, OrgId, UserId), default);

        var handler = new GetSubsectionByIdHandler(
            new Repository<Subsection>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSubsectionByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Subsection_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Subsection Test Story",
            UserId = UserId,
            OrganizationId = OrgId
        };
        db.Set<Story>().Add(story);
        db.SaveChanges();
        return story;
    }

    private static Section SeedSection(ApplicationDbContext db, Guid storyId)
    {
        var section = new Section
        {
            Id = Guid.NewGuid(),
            Title = "Parent Section",
            StoryId = storyId,
            UserId = UserId,
            OrganizationId = OrgId
        };
        db.Set<Section>().Add(section);
        db.SaveChanges();
        return section;
    }

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
