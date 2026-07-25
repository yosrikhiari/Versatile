using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.SparkHistoryItems.Commands;
using Versatile.Application.SparkHistoryItems.Handlers;
using Versatile.Application.SparkHistoryItems.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class SparkHistoryItemCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateSparkHistoryItemCommand(story.Id, "continuation", "Write the next chapter", "{\"style\":\"descriptive\"}", "Once upon a time...", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.StoryId.Should().Be(story.Id);
        result.Type.Should().Be("continuation");
        result.Prompt.Should().Be("Write the next chapter");
        result.Blueprint.Should().Be("{\"style\":\"descriptive\"}");
        result.GeneratedContent.Should().Be("Once upon a time...");
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateSparkHistoryItemCommand(story.Id, "type", null, null, null, OrgId, UserId), default);

        result.Prompt.Should().BeNull();
        result.Blueprint.Should().BeNull();
        result.GeneratedContent.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSparkHistoryItemCommand(Guid.NewGuid(), "type", null, null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "old-type", "old prompt", "old blueprint", "old content", OrgId, UserId), default);

        var updateHandler = new UpdateSparkHistoryItemHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSparkHistoryItemCommand(created.Id, "new-type", "new prompt", "new blueprint", "new content", OrgId, UserId), default);

        result.Type.Should().Be("new-type");
        result.Prompt.Should().Be("new prompt");
        result.Blueprint.Should().Be("new blueprint");
        result.GeneratedContent.Should().Be("new content");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "type", "prompt", "blueprint", "content", OrgId, UserId), default);

        var updateHandler = new UpdateSparkHistoryItemHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateSparkHistoryItemCommand(created.Id, Type: "updated-type", Prompt: null, Blueprint: null, GeneratedContent: null, OrgId, UserId), default);

        result.Type.Should().Be("updated-type");
        result.Prompt.Should().Be("prompt");
        result.Blueprint.Should().Be("blueprint");
        result.GeneratedContent.Should().Be("content");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "type", null, null, null, OrgId, UserId), default);

        var deleteHandler = new DeleteSparkHistoryItemHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteSparkHistoryItemCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<SparkHistoryItem>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteSparkHistoryItemHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteSparkHistoryItemCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByCreatedAtDesc()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "a", null, null, null, OrgId, UserId), default);
        await Task.Delay(10);
        var second = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "b", null, null, null, OrgId, UserId), default);

        var queryHandler = new GetSparkHistoryItemsHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db));
        var result = await queryHandler.Handle(new GetSparkHistoryItemsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "find-me", "prompt", null, null, OrgId, UserId), default);

        var queryHandler = new GetSparkHistoryItemByIdHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetSparkHistoryItemByIdQuery(created.Id, OrgId, UserId), default);

        result.Type.Should().Be("find-me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetSparkHistoryItemByIdHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetSparkHistoryItemByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "type", null, null, null, OrgId, UserId), default);

        var handler = new UpdateSparkHistoryItemHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSparkHistoryItemCommand(created.Id, "hacked", null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "type", null, null, null, OrgId, UserId), default);

        var handler = new UpdateSparkHistoryItemHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSparkHistoryItemCommand(created.Id, "hacked", null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "type", null, null, null, OrgId, UserId), default);

        var handler = new DeleteSparkHistoryItemHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSparkHistoryItemCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "type", null, null, null, OrgId, UserId), default);

        var handler = new DeleteSparkHistoryItemHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSparkHistoryItemCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "type", null, null, null, OrgId, UserId), default);

        var handler = new GetSparkHistoryItemByIdHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSparkHistoryItemByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateSparkHistoryItemHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<SparkHistoryItem>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateSparkHistoryItemCommand(story.Id, "type", null, null, null, OrgId, UserId), default);

        var handler = new GetSparkHistoryItemByIdHandler(
            new Repository<SparkHistoryItem>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSparkHistoryItemByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"SparkHistoryItem_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "SparkHistoryItem Test Story",
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
