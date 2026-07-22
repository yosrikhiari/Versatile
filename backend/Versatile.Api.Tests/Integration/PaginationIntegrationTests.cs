using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Chapters.Handlers;
using Versatile.Application.Chapters.Queries;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Handlers;
using Versatile.Application.Scenes.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Api.Tests.Integration;

public sealed class PaginationIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task GetChaptersQuery_FirstPage_ReturnsCorrectPage()
    {
        var db = CreateDbContext();
        var story = SeedStoryWithChapters(db, chapterCount: 5);

        var handler = new GetChaptersHandler(
            new Repository<Story>(db),
            new OrganizationOwnedRepository<Chapter>(db)
        );
        var query = new GetChaptersQuery(story.Id, OrgId, UserId, Page: 1, PageSize: 2);

        var result = await handler.Handle(query, default);

        result.Should().BeOfType<PagedResponse<ChapterDto>>();
        result.Items.Should().HaveCount(2);
        result.TotalCount.Should().Be(5);
        result.Page.Should().Be(1);
        result.PageSize.Should().Be(2);
        result.TotalPages.Should().Be(3);
        result.HasPreviousPage.Should().BeFalse();
        result.HasNextPage.Should().BeTrue();
    }

    [Fact]
    public async Task GetChaptersQuery_SecondPage_ReturnsRemainingItems()
    {
        var db = CreateDbContext();
        var story = SeedStoryWithChapters(db, chapterCount: 5);

        var handler = new GetChaptersHandler(
            new Repository<Story>(db),
            new OrganizationOwnedRepository<Chapter>(db)
        );
        var query = new GetChaptersQuery(story.Id, OrgId, UserId, Page: 2, PageSize: 2);

        var result = await handler.Handle(query, default);

        result.Items.Should().HaveCount(2);
        result.TotalCount.Should().Be(5);
        result.HasPreviousPage.Should().BeTrue();
        result.HasNextPage.Should().BeTrue();
    }

    [Fact]
    public async Task GetChaptersQuery_LastPage_ReturnsLastItemsAndNoNextPage()
    {
        var db = CreateDbContext();
        var story = SeedStoryWithChapters(db, chapterCount: 5);

        var handler = new GetChaptersHandler(
            new Repository<Story>(db),
            new OrganizationOwnedRepository<Chapter>(db)
        );
        var query = new GetChaptersQuery(story.Id, OrgId, UserId, Page: 3, PageSize: 2);

        var result = await handler.Handle(query, default);

        result.Items.Should().HaveCount(1);
        result.TotalCount.Should().Be(5);
        result.HasNextPage.Should().BeFalse();
    }

    [Fact]
    public async Task GetChaptersQuery_EmptyStory_ReturnsEmptyPage()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);

        var handler = new GetChaptersHandler(
            new Repository<Story>(db),
            new OrganizationOwnedRepository<Chapter>(db)
        );
        var query = new GetChaptersQuery(story.Id, OrgId, UserId);

        var result = await handler.Handle(query, default);

        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task GetChaptersQuery_ChaptersAreOrderedByOrder()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var chapterRepo = new OrganizationOwnedRepository<Chapter>(db);

        db.Set<Chapter>().AddRange(
            new Chapter { Id = Guid.NewGuid(), StoryId = story.Id, Title = "C", Order = 3, UserId = UserId, OrganizationId = OrgId },
            new Chapter { Id = Guid.NewGuid(), StoryId = story.Id, Title = "A", Order = 1, UserId = UserId, OrganizationId = OrgId },
            new Chapter { Id = Guid.NewGuid(), StoryId = story.Id, Title = "B", Order = 2, UserId = UserId, OrganizationId = OrgId }
        );
        await db.SaveChangesAsync();

        var handler = new GetChaptersHandler(
            new Repository<Story>(db),
            chapterRepo
        );
        var query = new GetChaptersQuery(story.Id, OrgId, UserId, PageSize: 10);

        var result = await handler.Handle(query, default);

        result.Items.Select(c => c.Title).Should().Equal("A", "B", "C");
    }

    [Fact]
    public async Task GetScenesQuery_FirstPage_ReturnsCorrectPage()
    {
        var db = CreateDbContext();
        var chapter = SeedChapterWithScenes(db, sceneCount: 5);

        var handler = new GetScenesHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db)
        );
        var query = new GetScenesQuery(chapter.Id, OrgId, UserId, Page: 1, PageSize: 2);

        var result = await handler.Handle(query, default);

        result.Items.Should().HaveCount(2);
        result.TotalCount.Should().Be(5);
        result.Page.Should().Be(1);
        result.PageSize.Should().Be(2);
        result.TotalPages.Should().Be(3);
        result.HasPreviousPage.Should().BeFalse();
        result.HasNextPage.Should().BeTrue();
    }

    [Fact]
    public async Task GetScenesQuery_SecondPage_ReturnsRemainingItems()
    {
        var db = CreateDbContext();
        var chapter = SeedChapterWithScenes(db, sceneCount: 5);

        var handler = new GetScenesHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db)
        );
        var query = new GetScenesQuery(chapter.Id, OrgId, UserId, Page: 2, PageSize: 2);

        var result = await handler.Handle(query, default);

        result.Items.Should().HaveCount(2);
        result.TotalCount.Should().Be(5);
        result.HasPreviousPage.Should().BeTrue();
        result.HasNextPage.Should().BeTrue();
    }

    [Fact]
    public async Task GetScenesQuery_LastPage_ReturnsLastItemsAndNoNextPage()
    {
        var db = CreateDbContext();
        var chapter = SeedChapterWithScenes(db, sceneCount: 5);

        var handler = new GetScenesHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db)
        );
        var query = new GetScenesQuery(chapter.Id, OrgId, UserId, Page: 3, PageSize: 2);

        var result = await handler.Handle(query, default);

        result.Items.Should().HaveCount(1);
        result.TotalCount.Should().Be(5);
        result.HasNextPage.Should().BeFalse();
    }

    [Fact]
    public async Task GetScenesQuery_EmptyChapter_ReturnsEmptyPage()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db);

        var handler = new GetScenesHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db)
        );
        var query = new GetScenesQuery(chapter.Id, OrgId, UserId);

        var result = await handler.Handle(query, default);

        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task GetScenesQuery_ScenesAreOrderedByOrder()
    {
        var db = CreateDbContext();
        var chapter = SeedChapter(db);

        db.Set<Scene>().AddRange(
            new Scene { Id = Guid.NewGuid(), ChapterId = chapter.Id, Title = "C", Content = "", Order = 3, UserId = UserId, OrganizationId = OrgId },
            new Scene { Id = Guid.NewGuid(), ChapterId = chapter.Id, Title = "A", Content = "", Order = 1, UserId = UserId, OrganizationId = OrgId },
            new Scene { Id = Guid.NewGuid(), ChapterId = chapter.Id, Title = "B", Content = "", Order = 2, UserId = UserId, OrganizationId = OrgId }
        );
        await db.SaveChangesAsync();

        var handler = new GetScenesHandler(
            new OrganizationOwnedRepository<Chapter>(db),
            new Repository<Scene>(db)
        );
        var query = new GetScenesQuery(chapter.Id, OrgId, UserId, PageSize: 10);

        var result = await handler.Handle(query, default);

        result.Items.Select(s => s.Title).Should().Equal("A", "B", "C");
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Pagination_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Pagination Test Story",
            UserId = UserId,
            OrganizationId = OrgId
        };
        db.Set<Story>().Add(story);
        db.SaveChanges();
        return story;
    }

    private static Story SeedStoryWithChapters(ApplicationDbContext db, int chapterCount)
    {
        var story = SeedStory(db);
        for (var i = 1; i <= chapterCount; i++)
        {
            db.Set<Chapter>().Add(new Chapter
            {
                Id = Guid.NewGuid(),
                StoryId = story.Id,
                Title = $"Chapter {i}",
                Order = i,
                UserId = UserId,
                OrganizationId = OrgId
            });
        }
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
            Title = "Scene Parent Chapter",
            Order = 1,
            UserId = UserId,
            OrganizationId = OrgId
        };
        db.Set<Chapter>().Add(chapter);
        db.SaveChanges();
        return chapter;
    }

    private static Chapter SeedChapterWithScenes(ApplicationDbContext db, int sceneCount)
    {
        var chapter = SeedChapter(db);
        for (var i = 1; i <= sceneCount; i++)
        {
            db.Set<Scene>().Add(new Scene
            {
                Id = Guid.NewGuid(),
                ChapterId = chapter.Id,
                Title = $"Scene {i}",
                Content = $"Content for scene {i}",
                Order = i,
                UserId = UserId,
                OrganizationId = OrgId
            });
        }
        db.SaveChanges();
        return chapter;
    }

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
