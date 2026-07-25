using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Manuscripts.Commands;
using Versatile.Application.Manuscripts.Handlers;
using Versatile.Application.Manuscripts.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class ManuscriptCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateManuscriptCommand(story.Id, "My Manuscript", "Content here", 0, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.Title.Should().Be("My Manuscript");
        result.Content.Should().Be("Content here");
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateManuscriptCommand(story.Id, "Title", null, 0, OrgId, UserId), default);

        result.Content.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateManuscriptCommand(Guid.NewGuid(), "Title", null, 0, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "Original", "Old content", 0, OrgId, UserId), default);

        var updateHandler = new UpdateManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateManuscriptCommand(created.Id, "Updated", "New content", null, OrgId, UserId), default);

        result.Title.Should().Be("Updated");
        result.Content.Should().Be("New content");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "Original", "Content", 0, OrgId, UserId), default);

        var updateHandler = new UpdateManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateManuscriptCommand(created.Id, Title: "Only Title Changed", null, null, OrgId, UserId), default);

        result.Title.Should().Be("Only Title Changed");
        result.Content.Should().Be("Content");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "To Delete", null, 0, OrgId, UserId), default);

        var deleteHandler = new DeleteManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteManuscriptCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<Manuscript>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteManuscriptCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "A", null, 0, OrgId, UserId), default);
        var second = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "B", null, 0, OrgId, UserId), default);

        var queryHandler = new GetManuscriptsHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db));
        var result = await queryHandler.Handle(new GetManuscriptsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Contain(first.Id);
        result.Select(e => e.Id).Should().Contain(second.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "Find Me", null, 0, OrgId, UserId), default);

        var queryHandler = new GetManuscriptByIdHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetManuscriptByIdQuery(created.Id, OrgId, UserId), default);

        result.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetManuscriptByIdHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetManuscriptByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "Title", null, 0, OrgId, UserId), default);

        var handler = new UpdateManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateManuscriptCommand(created.Id, "Hacked", null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "Title", null, 0, OrgId, UserId), default);

        var handler = new UpdateManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateManuscriptCommand(created.Id, "Hacked", null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "Title", null, 0, OrgId, UserId), default);

        var handler = new DeleteManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteManuscriptCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "Title", null, 0, OrgId, UserId), default);

        var handler = new DeleteManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteManuscriptCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "Title", null, 0, OrgId, UserId), default);

        var handler = new GetManuscriptByIdHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetManuscriptByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateManuscriptHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Manuscript>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateManuscriptCommand(story.Id, "Title", null, 0, OrgId, UserId), default);

        var handler = new GetManuscriptByIdHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetManuscriptByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Manuscript_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Manuscript Test Story",
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
