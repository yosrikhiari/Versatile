using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Chapters.Commands;
using Versatile.Application.Chapters.Handlers;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Commands;
using Versatile.Application.Scenes.Handlers;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Api.Tests.Integration;

public sealed class CqrsCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid DifferentUserId = Guid.NewGuid();

    [Fact]
    public async Task CreateChapter_WithValidData_ReturnsChapterDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateChapterHandler(db);

        var command = new CreateChapterCommand(
            StoryId: story.Id,
            Title: "Test Chapter",
            Order: 1,
            ArcAssignment: "Rising Action",
            OrganizationId: OrgId,
            UserId: UserId
        );

        var result = await handler.Handle(command, default);

        result.Should().NotBeNull();
        result.Title.Should().Be("Test Chapter");
        result.Order.Should().Be(1);
        result.ArcAssignment.Should().Be("Rising Action");
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task CreateChapter_AutoIncrementsOrder_WhenOrderIsZero()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateChapterHandler(db);

        await handler.Handle(new CreateChapterCommand(story.Id, "First", 0, null, OrgId, UserId), default);
        var second = await handler.Handle(new CreateChapterCommand(story.Id, "Second", 0, null, OrgId, UserId), default);

        second.Order.Should().Be(2);
    }

    [Fact]
    public async Task UpdateChapter_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateChapterHandler(db);

        var created = await handler.Handle(new CreateChapterCommand(story.Id, "Original Title", 1, null, OrgId, UserId), default);

        var updateHandler = new UpdateChapterHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );
        var updateCommand = new UpdateChapterCommand(
            Id: created.Id,
            Title: "Updated Title",
            Order: 2,
            Status: "published",
            ArcAssignment: "Climax",
            OrganizationId: OrgId,
            UserId: UserId
        );

        var result = await updateHandler.Handle(updateCommand, default);

        result.Title.Should().Be("Updated Title");
        result.Order.Should().Be(2);
        result.Status.Should().Be("published");
        result.ArcAssignment.Should().Be("Climax");
    }

    [Fact]
    public async Task DeleteChapter_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateChapterHandler(db);
        var created = await handler.Handle(new CreateChapterCommand(story.Id, "To Delete", 1, null, OrgId, UserId), default);

        var deleteHandler = new DeleteChapterHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );
        await deleteHandler.Handle(new DeleteChapterCommand(created.Id, OrgId, UserId), default);

        var repo = new OrganizationOwnedRepository<Chapter>(db);
        var chapter = await repo.GetByIdForOrganizationAsync(created.Id, OrgId);
        chapter.Should().BeNull();
    }

    [Fact]
    public async Task DeleteChapter_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteChapterHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteChapterCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task CreateScene_WithValidData_ReturnsSceneDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db);
        var handler = CreateSceneHandler(db);

        var command = new CreateSceneCommand(
            ChapterId: chapter.Id,
            Title: "Test Scene",
            Content: "Once upon a time there was a test",
            Order: 1,
            OrganizationId: OrgId,
            UserId: UserId
        );

        var result = await handler.Handle(command, default);

        result.Should().NotBeNull();
        result.Title.Should().Be("Test Scene");
        result.ChapterId.Should().Be(chapter.Id);
        result.WordCount.Should().Be(8);
        result.Order.Should().Be(1);
    }

    [Fact]
    public async Task CreateScene_AutoIncrementsOrder_WhenOrderIsZero()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db);
        var handler = CreateSceneHandler(db);

        await handler.Handle(new CreateSceneCommand(chapter.Id, "First", "a", 0, OrgId, UserId), default);
        var second = await handler.Handle(new CreateSceneCommand(chapter.Id, "Second", "b", 0, OrgId, UserId), default);

        second.Order.Should().Be(2);
    }

    [Fact]
    public async Task UpdateScene_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db);
        var handler = CreateSceneHandler(db);
        var created = await handler.Handle(new CreateSceneCommand(chapter.Id, "Original", "some content", 1, OrgId, UserId), default);

        var updateHandler = new UpdateSceneHandler(
            new Repository<Scene>(db),
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );
        var updateCommand = new UpdateSceneCommand(
            Id: created.Id,
            Title: "Updated Scene",
            Content: "brand new content here",
            Status: "revised",
            Order: 2,
            OrganizationId: OrgId,
            UserId: UserId
        );

        var result = await updateHandler.Handle(updateCommand, default);

        result.Title.Should().Be("Updated Scene");
        result.WordCount.Should().Be(4);
        result.Status.Should().Be("revised");
        result.Order.Should().Be(2);
    }

    [Fact]
    public async Task DeleteScene_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db);
        var handler = CreateSceneHandler(db);
        var created = await handler.Handle(new CreateSceneCommand(chapter.Id, "To Delete", "content", 1, OrgId, UserId), default);

        var deleteHandler = new DeleteSceneHandler(
            new Repository<Scene>(db),
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );
        await deleteHandler.Handle(new DeleteSceneCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<Scene>(db);
        var scene = await repo.GetByIdAsync(created.Id);
        scene.Should().BeNull();
    }

    [Fact]
    public async Task DeleteScene_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db);
        var deleteHandler = new DeleteSceneHandler(
            new Repository<Scene>(db),
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteSceneCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task CreateChapter_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateChapterHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateChapterCommand(Guid.NewGuid(), "Orphan", 1, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task CreateScene_ChapterNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateSceneHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSceneCommand(Guid.NewGuid(), "Orphan", "content", 1, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"CqrsCrud_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Test Story",
            UserId = UserId,
            OrganizationId = OrgId
        };
        db.Set<Story>().Add(story);
        db.SaveChanges();
        return story;
    }

    private static Chapter SeedChapter(ApplicationDbContext db)
    {
        var story = SeedStory(db);
        var chapter = new Chapter
        {
            Id = Guid.NewGuid(),
            StoryId = story.Id,
            Title = "Parent Chapter",
            Order = 1,
            UserId = UserId,
            OrganizationId = OrgId
        };
        db.Set<Chapter>().Add(chapter);
        db.SaveChanges();
        return chapter;
    }

    private static CreateChapterHandler CreateChapterHandler(ApplicationDbContext db) =>
        new(
            new Repository<Story>(db),
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

    private static CreateSceneHandler CreateSceneHandler(ApplicationDbContext db) =>
        new(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db),
            new UnitOfWork(db)
        );

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
