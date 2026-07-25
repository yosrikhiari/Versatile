using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Snippets.Commands;
using Versatile.Application.Snippets.Handlers;
using Versatile.Application.Snippets.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class SnippetCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var lastSeen = new DateTime(2025, 6, 1, 0, 0, 0, DateTimeKind.Utc);
        var result = await handler.Handle(new CreateSnippetCommand(story.Id, "protagonist", 5, lastSeen, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.StoryId.Should().Be(story.Id);
        result.Word.Should().Be("protagonist");
        result.Count.Should().Be(5);
        result.LastSeen.Should().Be(lastSeen);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithOptionalLastSeenNull_DefaultsToUtcNow()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var before = DateTime.UtcNow;
        var result = await handler.Handle(new CreateSnippetCommand(story.Id, "protagonist", 5, null, OrgId, UserId), default);
        var after = DateTime.UtcNow;

        result.LastSeen.Should().BeOnOrAfter(before);
        result.LastSeen.Should().BeOnOrBefore(after);
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSnippetCommand(Guid.NewGuid(), "word", 1, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var lastSeen = new DateTime(2025, 6, 1, 0, 0, 0, DateTimeKind.Utc);
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "protagonist", 5, lastSeen, OrgId, UserId), default);

        var newLastSeen = new DateTime(2025, 7, 1, 0, 0, 0, DateTimeKind.Utc);
        var updateHandler = new UpdateSnippetHandler(
            new Repository<Snippet>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSnippetCommand(created.Id, "hero", 10, newLastSeen, OrgId, UserId), default);

        result.Word.Should().Be("hero");
        result.Count.Should().Be(10);
        result.LastSeen.Should().Be(newLastSeen);
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var lastSeen = new DateTime(2025, 6, 1, 0, 0, 0, DateTimeKind.Utc);
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "protagonist", 5, lastSeen, OrgId, UserId), default);

        var updateHandler = new UpdateSnippetHandler(
            new Repository<Snippet>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSnippetCommand(created.Id, Word: "updated_word", Count: null, LastSeen: null, OrgId, UserId), default);

        result.Word.Should().Be("updated_word");
        result.Count.Should().Be(5);
        result.LastSeen.Should().Be(lastSeen);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "delete_me", 1, null, OrgId, UserId), default);

        var deleteHandler = new DeleteSnippetHandler(
            new Repository<Snippet>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteSnippetCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<Snippet>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteSnippetHandler(
            new Repository<Snippet>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteSnippetCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByCountDesc()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var low = await createHandler.Handle(new CreateSnippetCommand(story.Id, "rare", 1, null, OrgId, UserId), default);
        var high = await createHandler.Handle(new CreateSnippetCommand(story.Id, "common", 100, null, OrgId, UserId), default);

        var queryHandler = new GetSnippetsHandler(new Repository<Snippet>(db));
        var result = await queryHandler.Handle(new GetSnippetsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Equal(high.Id, low.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "FindMe", 5, null, OrgId, UserId), default);

        var queryHandler = new GetSnippetByIdHandler(new Repository<Snippet>(db));
        var result = await queryHandler.Handle(new GetSnippetByIdQuery(created.Id, OrgId, UserId), default);

        result.Word.Should().Be("FindMe");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetSnippetByIdHandler(new Repository<Snippet>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetSnippetByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "word", 1, null, OrgId, UserId), default);

        var handler = new UpdateSnippetHandler(
            new Repository<Snippet>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSnippetCommand(created.Id, null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "word", 1, null, OrgId, UserId), default);

        var handler = new UpdateSnippetHandler(
            new Repository<Snippet>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSnippetCommand(created.Id, null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "word", 1, null, OrgId, UserId), default);

        var handler = new DeleteSnippetHandler(
            new Repository<Snippet>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSnippetCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "word", 1, null, OrgId, UserId), default);

        var handler = new DeleteSnippetHandler(
            new Repository<Snippet>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSnippetCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "word", 1, null, OrgId, UserId), default);

        var handler = new GetSnippetByIdHandler(new Repository<Snippet>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSnippetByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnippetHandler(
            new Repository<Snippet>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnippetCommand(story.Id, "word", 1, null, OrgId, UserId), default);

        var handler = new GetSnippetByIdHandler(new Repository<Snippet>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSnippetByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Snippet_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Snippet Test Story",
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
