using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.SessionArchiveItems.Commands;
using Versatile.Application.SessionArchiveItems.Handlers;
using Versatile.Application.SessionArchiveItems.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class SessionArchiveItemCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));

        var timestamp = DateTime.UtcNow;
        var result = await handler.Handle(new CreateSessionArchiveItemCommand(story.Id, "user-said", "message", timestamp, "{\"text\":\"hello\"}", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.StoryId.Should().Be(story.Id);
        result.Signal.Should().Be("user-said");
        result.Type.Should().Be("message");
        result.Timestamp.Should().BeCloseTo(timestamp, TimeSpan.FromSeconds(1));
        result.Data.Should().Be("{\"text\":\"hello\"}");
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateSessionArchiveItemCommand(story.Id, "signal", "type", DateTime.UtcNow, null, OrgId, UserId), default);

        result.Data.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSessionArchiveItemCommand(Guid.NewGuid(), "s", "t", DateTime.UtcNow, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "old-signal", "old-type", DateTime.UtcNow, "old-data", OrgId, UserId), default);

        var updateHandler = new UpdateSessionArchiveItemHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var newTimestamp = DateTime.UtcNow.AddMinutes(5);
        var result = await updateHandler.Handle(new UpdateSessionArchiveItemCommand(created.Id, "new-signal", "new-type", newTimestamp, "new-data", OrgId, UserId), default);

        result.Signal.Should().Be("new-signal");
        result.Type.Should().Be("new-type");
        result.Timestamp.Should().BeCloseTo(newTimestamp, TimeSpan.FromSeconds(1));
        result.Data.Should().Be("new-data");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var originalTimestamp = DateTime.UtcNow;
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "signal", "type", originalTimestamp, "data", OrgId, UserId), default);

        var updateHandler = new UpdateSessionArchiveItemHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSessionArchiveItemCommand(created.Id, Signal: "updated-signal", Type: null, Timestamp: null, Data: null, OrgId, UserId), default);

        result.Signal.Should().Be("updated-signal");
        result.Type.Should().Be("type");
        result.Timestamp.Should().BeCloseTo(originalTimestamp, TimeSpan.FromSeconds(1));
        result.Data.Should().Be("data");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow, null, OrgId, UserId), default);

        var deleteHandler = new DeleteSessionArchiveItemHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteSessionArchiveItemCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<SessionArchiveItem>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteSessionArchiveItemHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteSessionArchiveItemCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByTimestampDesc()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow.AddMinutes(-10), null, OrgId, UserId), default);
        await Task.Delay(10);
        var second = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow, null, OrgId, UserId), default);

        var queryHandler = new GetSessionArchiveItemsHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db));
        var result = await queryHandler.Handle(new GetSessionArchiveItemsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow, null, OrgId, UserId), default);

        var queryHandler = new GetSessionArchiveItemByIdHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetSessionArchiveItemByIdQuery(created.Id, OrgId, UserId), default);

        result.Signal.Should().Be("s");
        result.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetSessionArchiveItemByIdHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetSessionArchiveItemByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new UpdateSessionArchiveItemHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSessionArchiveItemCommand(created.Id, "hacked", null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new UpdateSessionArchiveItemHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSessionArchiveItemCommand(created.Id, "hacked", null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new DeleteSessionArchiveItemHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSessionArchiveItemCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new DeleteSessionArchiveItemHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSessionArchiveItemCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new GetSessionArchiveItemByIdHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSessionArchiveItemByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSessionArchiveItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SessionArchiveItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSessionArchiveItemCommand(story.Id, "s", "t", DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new GetSessionArchiveItemByIdHandler(
            new Repository<SessionArchiveItem>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSessionArchiveItemByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"SessionArchiveItem_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "SessionArchiveItem Test Story",
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
