using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Annotations.Commands;
using Versatile.Application.Annotations.Handlers;
using Versatile.Application.Annotations.Queries;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class AnnotationCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateAnnotationCommand(story.Id, 0, "p1", "grammar", "Original text", "Suggested text", "Fix grammar", "pending", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.StoryId.Should().Be(story.Id);
        result.ParagraphIndex.Should().Be(0);
        result.ParagraphId.Should().Be("p1");
        result.Type.Should().Be("grammar");
        result.Original.Should().Be("Original text");
        result.Suggestion.Should().Be("Suggested text");
        result.Reason.Should().Be("Fix grammar");
        result.Status.Should().Be("pending");
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", null, null, null, null, OrgId, UserId), default);

        result.ParagraphId.Should().BeNull();
        result.Original.Should().BeNull();
        result.Suggestion.Should().BeNull();
        result.Reason.Should().BeNull();
        result.Status.Should().Be("pending");
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateAnnotationCommand(Guid.NewGuid(), 0, null, "grammar", null, null, null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, "p1", "grammar", "Original", "Suggestion", "Reason", "pending", OrgId, UserId), default);

        var updateHandler = new UpdateAnnotationHandler(
            new Repository<Annotation>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateAnnotationCommand(created.Id, 1, "p2", "style", "New original", "New suggestion", "New reason", "resolved", OrgId, UserId), default);

        result.ParagraphIndex.Should().Be(1);
        result.ParagraphId.Should().Be("p2");
        result.Type.Should().Be("style");
        result.Original.Should().Be("New original");
        result.Suggestion.Should().Be("New suggestion");
        result.Reason.Should().Be("New reason");
        result.Status.Should().Be("resolved");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, "p1", "grammar", "Original", "Suggestion", "Reason", "pending", OrgId, UserId), default);

        var updateHandler = new UpdateAnnotationHandler(
            new Repository<Annotation>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateAnnotationCommand(created.Id, ParagraphIndex: 5, ParagraphId: null, Type: null, Original: null, Suggestion: null, Reason: null, Status: null, OrgId, UserId), default);

        result.ParagraphIndex.Should().Be(5);
        result.ParagraphId.Should().Be("p1");
        result.Type.Should().Be("grammar");
        result.Original.Should().Be("Original");
        result.Suggestion.Should().Be("Suggestion");
        result.Reason.Should().Be("Reason");
        result.Status.Should().Be("pending");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", null, null, null, null, OrgId, UserId), default);

        var deleteHandler = new DeleteAnnotationHandler(
            new Repository<Annotation>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteAnnotationCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<Annotation>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteAnnotationHandler(
            new Repository<Annotation>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteAnnotationCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByCreatedAtDesc()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", null, null, null, null, OrgId, UserId), default);
        await Task.Delay(10);
        var second = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 1, null, "style", null, null, null, null, OrgId, UserId), default);

        var queryHandler = new GetAnnotationsHandler(new Repository<Annotation>(db));
        var result = await queryHandler.Handle(new GetAnnotationsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", "Find Me", null, null, null, OrgId, UserId), default);

        var queryHandler = new GetAnnotationByIdHandler(new Repository<Annotation>(db));
        var result = await queryHandler.Handle(new GetAnnotationByIdQuery(created.Id, OrgId, UserId), default);

        result.Original.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetAnnotationByIdHandler(new Repository<Annotation>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetAnnotationByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", null, null, null, null, OrgId, UserId), default);

        var handler = new UpdateAnnotationHandler(
            new Repository<Annotation>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateAnnotationCommand(created.Id, null, null, null, null, null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", null, null, null, null, OrgId, UserId), default);

        var handler = new UpdateAnnotationHandler(
            new Repository<Annotation>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateAnnotationCommand(created.Id, null, null, null, null, null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", null, null, null, null, OrgId, UserId), default);

        var handler = new DeleteAnnotationHandler(
            new Repository<Annotation>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteAnnotationCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", null, null, null, null, OrgId, UserId), default);

        var handler = new DeleteAnnotationHandler(
            new Repository<Annotation>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteAnnotationCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", null, null, null, null, OrgId, UserId), default);

        var handler = new GetAnnotationByIdHandler(new Repository<Annotation>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetAnnotationByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAnnotationHandler(
            new Repository<Annotation>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAnnotationCommand(story.Id, 0, null, "grammar", null, null, null, null, OrgId, UserId), default);

        var handler = new GetAnnotationByIdHandler(new Repository<Annotation>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetAnnotationByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Annotation_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "Annotation Test Story",
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
