using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Chapters.Commands;
using Versatile.Application.Chapters.Handlers;
using Versatile.Application.Chapters.Queries;
using Versatile.Application.Scenes.Commands;
using Versatile.Application.Scenes.Handlers;
using Versatile.Application.Scenes.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Api.Tests.Integration;

public sealed class MultiTenancyIntegrationTests
{
    private static readonly Guid OrgA = Guid.NewGuid();
    private static readonly Guid OrgB = Guid.NewGuid();
    private static readonly Guid UserA = Guid.NewGuid();
    private static readonly Guid UserB = Guid.NewGuid();

    [Fact]
    public async Task CreateChapter_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);
        var handler = CreateChapterHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateChapterCommand(story.Id, "Test", 1, null, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task CreateChapter_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);
        var handler = CreateChapterHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateChapterCommand(story.Id, "Test", 1, null, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateChapter_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new UpdateChapterHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateChapterCommand(chapter.Id, "Hacked", null, null, null, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateChapter_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new UpdateChapterHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateChapterCommand(chapter.Id, "Hacked", null, null, null, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteChapter_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new DeleteChapterHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteChapterCommand(chapter.Id, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteChapter_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new DeleteChapterHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteChapterCommand(chapter.Id, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetChaptersQuery_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);

        var handler = new GetChaptersHandler(
            new Repository<Story>(db),
            new OrganizationOwnedRepository<Chapter>(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new GetChaptersQuery(story.Id, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetChaptersQuery_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db, OrgA, UserA);

        var handler = new GetChaptersHandler(
            new Repository<Story>(db),
            new OrganizationOwnedRepository<Chapter>(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new GetChaptersQuery(story.Id, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetChapterByIdQuery_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new GetChapterByIdHandler(
            new OrganizationOwnedRepository<Chapter>(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new GetChapterByIdQuery(chapter.Id, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetChapterByIdQuery_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new GetChapterByIdHandler(
            new OrganizationOwnedRepository<Chapter>(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new GetChapterByIdQuery(chapter.Id, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task CreateScene_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new CreateSceneHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSceneCommand(chapter.Id, "Test", "content", 1, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task CreateScene_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new CreateSceneHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateSceneCommand(chapter.Id, "Test", "content", 1, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateScene_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var scene = SeedScene(db, OrgA, UserA);

        var handler = new UpdateSceneHandler(
            new Repository<Scene>(db),
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSceneCommand(scene.Id, "Hacked", null, null, null, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateScene_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var scene = SeedScene(db, OrgA, UserA);

        var handler = new UpdateSceneHandler(
            new Repository<Scene>(db),
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateSceneCommand(scene.Id, "Hacked", null, null, null, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteScene_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var scene = SeedScene(db, OrgA, UserA);

        var handler = new DeleteSceneHandler(
            new Repository<Scene>(db),
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSceneCommand(scene.Id, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteScene_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var scene = SeedScene(db, OrgA, UserA);

        var handler = new DeleteSceneHandler(
            new Repository<Scene>(db),
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteSceneCommand(scene.Id, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetScenesQuery_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new GetScenesHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new GetScenesQuery(chapter.Id, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetScenesQuery_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db, OrgA, UserA);

        var handler = new GetScenesHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new GetScenesQuery(chapter.Id, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetSceneByIdQuery_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var scene = SeedScene(db, OrgA, UserA);

        var handler = new GetSceneByIdHandler(
            new Repository<Scene>(db),
            new OrganizationOwnedRepository<Chapter>(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSceneByIdQuery(scene.Id, OrgB, UserA), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetSceneByIdQuery_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var scene = SeedScene(db, OrgA, UserA);

        var handler = new GetSceneByIdHandler(
            new Repository<Scene>(db),
            new OrganizationOwnedRepository<Chapter>(db)
        );

        await FluentActions
            .Awaiting(() => handler.Handle(new GetSceneByIdQuery(scene.Id, OrgA, UserB), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"MultiTenancy_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db, Guid orgId, Guid userId)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Multi-tenancy Story",
            UserId = userId,
            OrganizationId = orgId
        };
        db.Set<Story>().Add(story);
        db.SaveChanges();
        return story;
    }

    private static Chapter SeedChapter(ApplicationDbContext db, Guid orgId, Guid userId)
    {
        var story = SeedStory(db, orgId, userId);
        var chapter = new Chapter
        {
            Id = Guid.NewGuid(),
            StoryId = story.Id,
            Title = "Owned Chapter",
            Order = 1,
            UserId = userId,
            OrganizationId = orgId
        };
        db.Set<Chapter>().Add(chapter);
        db.SaveChanges();
        return chapter;
    }

    private static Scene SeedScene(ApplicationDbContext db, Guid orgId, Guid userId)
    {
        var chapter = SeedChapter(db, orgId, userId);
        var scene = new Scene
        {
            Id = Guid.NewGuid(),
            ChapterId = chapter.Id,
            Title = "Owned Scene",
            Content = "some content",
            Order = 1,
            UserId = userId,
            OrganizationId = orgId
        };
        db.Set<Scene>().Add(scene);
        db.SaveChanges();
        return scene;
    }

    private static CreateChapterHandler CreateChapterHandler(ApplicationDbContext db) =>
        new(
            new Repository<Story>(db),
            new OrganizationOwnedRepository<Chapter>(db),
            new UnitOfWork(db)
        );

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
