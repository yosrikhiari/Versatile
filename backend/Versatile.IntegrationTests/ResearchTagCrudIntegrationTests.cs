using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchTags.Commands;
using Versatile.Application.ResearchTags.Handlers;
using Versatile.Application.ResearchTags.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class ResearchTagCrudIntegrationTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateResearchTagCommand("Important", story.Id, "#ff0000", UserId), default);

        result.Should().NotBeNull();
        result.Name.Should().Be("Important");
        result.Color.Should().Be("#ff0000");
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateResearchTagCommand("NoColor", story.Id, null, UserId), default);

        result.Name.Should().Be("NoColor");
        result.Color.Should().BeEmpty();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateResearchTagCommand("Orphan", Guid.NewGuid(), null, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchTagCommand("Old", story.Id, "#000", UserId), default);

        var updateHandler = new UpdateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateResearchTagCommand(created.Id, "New", "#fff", UserId), default);

        result.Name.Should().Be("New");
        result.Color.Should().Be("#fff");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchTagCommand("Original", story.Id, "#abc", UserId), default);

        var updateHandler = new UpdateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateResearchTagCommand(created.Id, Name: "Renamed", null, UserId), default);

        result.Name.Should().Be("Renamed");
        result.Color.Should().Be("#abc");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchTagCommand("To Delete", story.Id, null, UserId), default);

        var deleteHandler = new DeleteResearchTagHandler(
            new Repository<ResearchTag>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteResearchTagCommand(created.Id, UserId), default);

        var repo = new Repository<ResearchTag>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteResearchTagHandler(
            new Repository<ResearchTag>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteResearchTagCommand(Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByName()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateResearchTagCommand("B", story.Id, null, UserId), default);
        var second = await createHandler.Handle(new CreateResearchTagCommand("A", story.Id, null, UserId), default);

        var queryHandler = new GetResearchTagsHandler(
            new Repository<ResearchTag>(db));
        var result = await queryHandler.Handle(new GetResearchTagsQuery(story.Id, UserId), default);

        result.Select(e => e.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchTagCommand("Find Me", story.Id, null, UserId), default);

        var queryHandler = new GetResearchTagByIdHandler(
            new Repository<ResearchTag>(db));
        var result = await queryHandler.Handle(new GetResearchTagByIdQuery(created.Id, UserId), default);

        result.Name.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetResearchTagByIdHandler(
            new Repository<ResearchTag>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetResearchTagByIdQuery(Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchTagCommand("Title", story.Id, null, UserId), default);

        var handler = new UpdateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateResearchTagCommand(created.Id, "Hacked", null, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchTagCommand("Title", story.Id, null, UserId), default);

        var handler = new DeleteResearchTagHandler(
            new Repository<ResearchTag>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteResearchTagCommand(created.Id, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchTagHandler(
            new Repository<ResearchTag>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchTagCommand("Title", story.Id, null, UserId), default);

        var handler = new GetResearchTagByIdHandler(
            new Repository<ResearchTag>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetResearchTagByIdQuery(created.Id, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"ResearchTag_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "ResearchTag Test Story",
            UserId = UserId
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