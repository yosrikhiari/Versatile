using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.GeneratedStories.Commands;
using Versatile.Application.GeneratedStories.Handlers;
using Versatile.Application.GeneratedStories.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class GeneratedStoryCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateGeneratedStoryCommand(story.Id, "Generated Title", "Generated content", 500, 0.95, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.Title.Should().Be("Generated Title");
        result.Content.Should().Be("Generated content");
        result.TotalWords.Should().Be(500);
        result.QualityScore.Should().Be(0.95);
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithNullOptionalFields_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateGeneratedStoryCommand(story.Id, "Title", null, 0, null, OrgId, UserId), default);

        result.Content.Should().BeNull();
        result.QualityScore.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateGeneratedStoryCommand(Guid.NewGuid(), "Title", null, 0, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "Original", "Old content", 100, 0.5, OrgId, UserId), default);

        var updateHandler = new UpdateGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateGeneratedStoryCommand(created.Id, "Updated", "New content", 200, 0.9, OrgId, UserId), default);

        result.Title.Should().Be("Updated");
        result.Content.Should().Be("New content");
        result.TotalWords.Should().Be(200);
        result.QualityScore.Should().Be(0.9);
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "Original", "Content", 100, 0.5, OrgId, UserId), default);

        var updateHandler = new UpdateGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateGeneratedStoryCommand(created.Id, Title: "Only Title Changed", null, null, null, OrgId, UserId), default);

        result.Title.Should().Be("Only Title Changed");
        result.Content.Should().Be("Content");
        result.TotalWords.Should().Be(100);
        result.QualityScore.Should().Be(0.5);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "To Delete", null, 0, null, OrgId, UserId), default);

        var deleteHandler = new DeleteGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteGeneratedStoryCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<GeneratedStory>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteGeneratedStoryCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByGeneratedAtDesc()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "A", null, 100, null, OrgId, UserId), default);
        await Task.Delay(10);
        var second = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "B", null, 200, null, OrgId, UserId), default);

        var queryHandler = new GetGeneratedStoriesHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db));
        var result = await queryHandler.Handle(new GetGeneratedStoriesQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "Find Me", null, 100, null, OrgId, UserId), default);

        var queryHandler = new GetGeneratedStoryByIdHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetGeneratedStoryByIdQuery(created.Id, OrgId, UserId), default);

        result.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetGeneratedStoryByIdHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetGeneratedStoryByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "Title", null, 100, null, OrgId, UserId), default);

        var handler = new UpdateGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateGeneratedStoryCommand(created.Id, "Hacked", null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "Title", null, 100, null, OrgId, UserId), default);

        var handler = new UpdateGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateGeneratedStoryCommand(created.Id, "Hacked", null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "Title", null, 100, null, OrgId, UserId), default);

        var handler = new DeleteGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteGeneratedStoryCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "Title", null, 100, null, OrgId, UserId), default);

        var handler = new DeleteGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteGeneratedStoryCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "Title", null, 100, null, OrgId, UserId), default);

        var handler = new GetGeneratedStoryByIdHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetGeneratedStoryByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateGeneratedStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<GeneratedStory>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateGeneratedStoryCommand(story.Id, "Title", null, 100, null, OrgId, UserId), default);

        var handler = new GetGeneratedStoryByIdHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetGeneratedStoryByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"GeneratedStory_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "GeneratedStory Test Story",
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
