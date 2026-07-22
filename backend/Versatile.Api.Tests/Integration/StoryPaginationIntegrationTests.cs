using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Handlers;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Api.Tests.Integration;

public sealed class StoryPaginationIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task GetStoriesQuery_FirstPage_ReturnsCorrectPage()
    {
        var db = CreateDbContext();
        var storyIds = SeedStories(db, count: 5);

        var handler = new GetStoriesHandler(new Repository<Story>(db));
        var query = new GetStoriesQuery(OrgId, UserId, Page: 1, PageSize: 2);

        var result = await handler.Handle(query, default);

        result.Should().BeOfType<PagedResponse<StoryDto>>();
        result.Items.Should().HaveCount(2);
        result.TotalCount.Should().Be(5);
        result.Page.Should().Be(1);
        result.PageSize.Should().Be(2);
        result.TotalPages.Should().Be(3);
        result.HasPreviousPage.Should().BeFalse();
        result.HasNextPage.Should().BeTrue();
    }

    [Fact]
    public async Task GetStoriesQuery_SecondPage_ReturnsRemainingItems()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 5);

        var handler = new GetStoriesHandler(new Repository<Story>(db));
        var query = new GetStoriesQuery(OrgId, UserId, Page: 2, PageSize: 2);

        var result = await handler.Handle(query, default);

        result.Items.Should().HaveCount(2);
        result.TotalCount.Should().Be(5);
        result.HasPreviousPage.Should().BeTrue();
        result.HasNextPage.Should().BeTrue();
    }

    [Fact]
    public async Task GetStoriesQuery_LastPage_ReturnsLastItemsAndNoNextPage()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 5);

        var handler = new GetStoriesHandler(new Repository<Story>(db));
        var query = new GetStoriesQuery(OrgId, UserId, Page: 3, PageSize: 2);

        var result = await handler.Handle(query, default);

        result.Items.Should().HaveCount(1);
        result.TotalCount.Should().Be(5);
        result.HasNextPage.Should().BeFalse();
    }

    [Fact]
    public async Task GetStoriesQuery_Empty_ReturnsEmptyPage()
    {
        var db = CreateDbContext();

        var handler = new GetStoriesHandler(new Repository<Story>(db));
        var query = new GetStoriesQuery(OrgId, UserId);

        var result = await handler.Handle(query, default);

        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
    }

    [Fact]
    public async Task GetStoriesQuery_DefaultPageSizeIs20()
    {
        var db = CreateDbContext();
        SeedStories(db, count: 25);

        var handler = new GetStoriesHandler(new Repository<Story>(db));
        var result = await handler.Handle(new GetStoriesQuery(OrgId, UserId), default);

        result.Items.Should().HaveCount(20);
        result.TotalCount.Should().Be(25);
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"StoryPagination_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static List<Guid> SeedStories(ApplicationDbContext db, int count)
    {
        var ids = new List<Guid>();
        for (var i = 1; i <= count; i++)
        {
            var id = Guid.NewGuid();
            ids.Add(id);
            db.Set<Story>().Add(new Story
            {
                Id = id,
                Title = $"Story {i}",
                Premise = $"Premise {i}",
                UserId = UserId,
                OrganizationId = OrgId,
                UpdatedAt = DateTime.UtcNow.AddMinutes(-count + i)
            });
        }
        db.SaveChanges();
        return ids;
    }

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
