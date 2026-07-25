using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.BibleEntries.Commands;
using Versatile.Application.BibleEntries.Handlers;
using Versatile.Application.BibleEntries.Queries;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class BibleEntryCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateBibleEntryCommand(story.Id, "Genesis 1", "In the beginning...", "Creation", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.Title.Should().Be("Genesis 1");
        result.Content.Should().Be("In the beginning...");
        result.Category.Should().Be("Creation");
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateBibleEntryCommand(story.Id, "Title", "Content", null, OrgId, UserId), default);

        result.Category.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateBibleEntryCommand(Guid.NewGuid(), "Title", "Content", null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "Original", "Old content", "Old", OrgId, UserId), default);

        var updateHandler = new UpdateBibleEntryHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateBibleEntryCommand(created.Id, "Updated", "New content", "New", OrgId, UserId), default);

        result.Title.Should().Be("Updated");
        result.Content.Should().Be("New content");
        result.Category.Should().Be("New");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "Original", "Content", "Category", OrgId, UserId), default);

        var updateHandler = new UpdateBibleEntryHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateBibleEntryCommand(created.Id, Title: "Only Title Changed", null, null, OrgId, UserId), default);

        result.Title.Should().Be("Only Title Changed");
        result.Content.Should().Be("Content");
        result.Category.Should().Be("Category");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "To Delete", "Content", null, OrgId, UserId), default);

        var deleteHandler = new DeleteBibleEntryHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteBibleEntryCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<BibleEntry>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteBibleEntryHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteBibleEntryCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByUpdatedAtDesc()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "B", "Content", null, OrgId, UserId), default);
        await Task.Delay(10);
        var second = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "A", "Content", null, OrgId, UserId), default);

        var queryHandler = new GetBibleEntriesHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db));
        var result = await queryHandler.Handle(new GetBibleEntriesQuery(story.Id, OrgId, UserId, PageSize: 10), default);

        result.Items.Select(e => e.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetList_WithPagination_ReturnsCorrectPage()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        for (var i = 1; i <= 5; i++)
            await createHandler.Handle(new CreateBibleEntryCommand(story.Id, $"Entry {i}", "Content", null, OrgId, UserId), default);

        var queryHandler = new GetBibleEntriesHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db));
        var result = await queryHandler.Handle(new GetBibleEntriesQuery(story.Id, OrgId, UserId, Page: 1, PageSize: 2), default);

        result.Should().BeOfType<PagedResponse<BibleEntryDto>>();
        result.Items.Should().HaveCount(2);
        result.TotalCount.Should().Be(5);
        result.Page.Should().Be(1);
        result.PageSize.Should().Be(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "Find Me", "Content", null, OrgId, UserId), default);

        var queryHandler = new GetBibleEntryByIdHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetBibleEntryByIdQuery(created.Id, OrgId, UserId), default);

        result.Title.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetBibleEntryByIdHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetBibleEntryByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "Title", "Content", null, OrgId, UserId), default);

        var handler = new UpdateBibleEntryHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateBibleEntryCommand(created.Id, "Hacked", null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "Title", "Content", null, OrgId, UserId), default);

        var handler = new UpdateBibleEntryHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateBibleEntryCommand(created.Id, "Hacked", null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "Title", "Content", null, OrgId, UserId), default);

        var handler = new DeleteBibleEntryHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteBibleEntryCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "Title", "Content", null, OrgId, UserId), default);

        var handler = new DeleteBibleEntryHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteBibleEntryCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "Title", "Content", null, OrgId, UserId), default);

        var handler = new GetBibleEntryByIdHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetBibleEntryByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateBibleEntryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<BibleEntry>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateBibleEntryCommand(story.Id, "Title", "Content", null, OrgId, UserId), default);

        var handler = new GetBibleEntryByIdHandler(
            new Repository<BibleEntry>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetBibleEntryByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"BibleEntry_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "BibleEntry Test Story",
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
