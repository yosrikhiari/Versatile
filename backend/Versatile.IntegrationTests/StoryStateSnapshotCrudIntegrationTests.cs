using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.StoryStateSnapshots.Commands;
using Versatile.Application.StoryStateSnapshots.Handlers;
using Versatile.Application.StoryStateSnapshots.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class StoryStateSnapshotCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));

        var timestamp = DateTime.UtcNow;
        var result = await handler.Handle(new CreateStoryStateSnapshotCommand(story.Id, timestamp, "{\"chapter\":5}", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.StoryId.Should().Be(story.Id);
        result.Timestamp.Should().BeCloseTo(timestamp, TimeSpan.FromSeconds(1));
        result.Data.Should().Be("{\"chapter\":5}");
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);

        result.Data.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateStoryStateSnapshotCommand(Guid.NewGuid(), DateTime.UtcNow, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, "old-data", OrgId, UserId), default);

        var updateHandler = new UpdateStoryStateSnapshotHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateStoryStateSnapshotCommand(created.Id, "new-data", OrgId, UserId), default);

        result.Data.Should().Be("new-data");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);

        var deleteHandler = new DeleteStoryStateSnapshotHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteStoryStateSnapshotCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<StoryStateSnapshot>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteStoryStateSnapshotHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteStoryStateSnapshotCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsAllItems()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);
        await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);

        var queryHandler = new GetStoryStateSnapshotsHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetStoryStateSnapshotsQuery(story.Id, OrgId, UserId), default);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, "findable", OrgId, UserId), default);

        var queryHandler = new GetStoryStateSnapshotByIdHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetStoryStateSnapshotByIdQuery(created.Id, OrgId, UserId), default);

        result.Data.Should().Be("findable");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetStoryStateSnapshotByIdHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetStoryStateSnapshotByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new UpdateStoryStateSnapshotHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateStoryStateSnapshotCommand(created.Id, "hacked", OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new UpdateStoryStateSnapshotHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateStoryStateSnapshotCommand(created.Id, "hacked", Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new DeleteStoryStateSnapshotHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteStoryStateSnapshotCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new DeleteStoryStateSnapshotHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteStoryStateSnapshotCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new GetStoryStateSnapshotByIdHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetStoryStateSnapshotByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateStoryStateSnapshotHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<StoryStateSnapshot>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateStoryStateSnapshotCommand(story.Id, DateTime.UtcNow, null, OrgId, UserId), default);

        var handler = new GetStoryStateSnapshotByIdHandler(
            new Repository<StoryStateSnapshot>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetStoryStateSnapshotByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"StoryStateSnapshot_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "StoryStateSnapshot Test Story",
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
