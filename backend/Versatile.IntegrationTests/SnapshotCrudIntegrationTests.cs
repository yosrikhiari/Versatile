using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Snapshots.Commands;
using Versatile.Application.Snapshots.Handlers;
using Versatile.Application.Snapshots.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class SnapshotCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));

        var timestamp = DateTime.UtcNow;
        var result = await handler.Handle(new CreateSnapshotCommand(story.Id, null, timestamp, "Chapter 1", "{\"events\":[]}", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.StoryId.Should().Be(story.Id);
        result.ChapterId.Should().BeNull();
        result.Timestamp.Should().BeCloseTo(timestamp, TimeSpan.FromSeconds(1));
        result.Label.Should().Be("Chapter 1");
        result.Data.Should().Be("{\"events\":[]}");
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, null, null, OrgId, UserId), default);

        result.Label.Should().BeNull();
        result.Data.Should().BeNull();
        result.ChapterId.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSnapshotCommand(Guid.NewGuid(), null, DateTime.UtcNow, null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var chapterId = Guid.NewGuid();
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, "Old Label", "old-data", OrgId, UserId), default);

        var updateHandler = new UpdateSnapshotHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSnapshotCommand(created.Id, chapterId, "New Label", "new-data", OrgId, UserId), default);

        result.ChapterId.Should().Be(chapterId);
        result.Label.Should().Be("New Label");
        result.Data.Should().Be("new-data");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var timestamp = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, timestamp, "Label", "data", OrgId, UserId), default);

        var updateHandler = new UpdateSnapshotHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSnapshotCommand(created.Id, ChapterId: null, Label: "Only Label Changed", Data: null, OrgId, UserId), default);

        result.Label.Should().Be("Only Label Changed");
        result.Data.Should().Be("data");
        result.ChapterId.Should().BeNull();
        result.Timestamp.Should().Be(timestamp);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, null, null, OrgId, UserId), default);

        var deleteHandler = new DeleteSnapshotHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteSnapshotCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<Snapshot>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteSnapshotHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteSnapshotCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByTimestampDesc()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow.AddMinutes(-10), null, null, OrgId, UserId), default);
        var second = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, null, null, OrgId, UserId), default);

        var queryHandler = new GetSnapshotsHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db));
        var result = await queryHandler.Handle(new GetSnapshotsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, "Find Me", null, OrgId, UserId), default);

        var queryHandler = new GetSnapshotByIdHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetSnapshotByIdQuery(created.Id, OrgId, UserId), default);

        result.Label.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetSnapshotByIdHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetSnapshotByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, null, null, OrgId, UserId), default);

        var handler = new UpdateSnapshotHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSnapshotCommand(created.Id, null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, null, null, OrgId, UserId), default);

        var handler = new UpdateSnapshotHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSnapshotCommand(created.Id, null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, null, null, OrgId, UserId), default);

        var handler = new DeleteSnapshotHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSnapshotCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, null, null, OrgId, UserId), default);

        var handler = new DeleteSnapshotHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSnapshotCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, null, null, OrgId, UserId), default);

        var handler = new GetSnapshotByIdHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSnapshotByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<Snapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSnapshotCommand(story.Id, null, DateTime.UtcNow, null, null, OrgId, UserId), default);

        var handler = new GetSnapshotByIdHandler(
            new Repository<Snapshot>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSnapshotByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Snapshot_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Snapshot Test Story",
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
