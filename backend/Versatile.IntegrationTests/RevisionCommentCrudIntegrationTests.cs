using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.RevisionComments.Commands;
using Versatile.Application.RevisionComments.Handlers;
using Versatile.Application.RevisionComments.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class RevisionCommentCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 5, 20, "selected text", "Fix this", false, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.StoryId.Should().Be(story.Id);
        result.ParagraphIndex.Should().Be(0);
        result.StartOffset.Should().Be(5);
        result.EndOffset.Should().Be(20);
        result.SelectedText.Should().Be("selected text");
        result.Comment.Should().Be("Fix this");
        result.Resolved.Should().BeFalse();
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, null, null, null, OrgId, UserId), default);

        result.SelectedText.Should().BeNull();
        result.Comment.Should().BeNull();
        result.Resolved.Should().BeFalse();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateRevisionCommentCommand(Guid.NewGuid(), 0, 0, 1, null, null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 5, 20, "old text", "Old comment", false, OrgId, UserId), default);

        var updateHandler = new UpdateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateRevisionCommentCommand(created.Id, 1, 10, 30, "new text", "New comment", true, OrgId, UserId), default);

        result.ParagraphIndex.Should().Be(1);
        result.StartOffset.Should().Be(10);
        result.EndOffset.Should().Be(30);
        result.SelectedText.Should().Be("new text");
        result.Comment.Should().Be("New comment");
        result.Resolved.Should().BeTrue();
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 5, 20, "selected", "Comment", false, OrgId, UserId), default);

        var updateHandler = new UpdateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateRevisionCommentCommand(created.Id, ParagraphIndex: 2, StartOffset: null, EndOffset: null, SelectedText: null, Comment: null, Resolved: true, OrgId, UserId), default);

        result.ParagraphIndex.Should().Be(2);
        result.StartOffset.Should().Be(5);
        result.EndOffset.Should().Be(20);
        result.SelectedText.Should().Be("selected");
        result.Comment.Should().Be("Comment");
        result.Resolved.Should().BeTrue();
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, null, null, null, OrgId, UserId), default);

        var deleteHandler = new DeleteRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteRevisionCommentCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<RevisionComment>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteRevisionCommentCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByCreatedAtDesc()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, null, "First", null, OrgId, UserId), default);
        await Task.Delay(10);
        var second = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 1, 2, 3, null, "Second", null, OrgId, UserId), default);

        var queryHandler = new GetRevisionCommentsHandler(new Repository<RevisionComment>(db));
        var result = await queryHandler.Handle(new GetRevisionCommentsQuery(story.Id, OrgId, UserId), default);

        result.Select(e => e.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, "Find Me", null, null, OrgId, UserId), default);

        var queryHandler = new GetRevisionCommentByIdHandler(new Repository<RevisionComment>(db));
        var result = await queryHandler.Handle(new GetRevisionCommentByIdQuery(created.Id, OrgId, UserId), default);

        result.SelectedText.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetRevisionCommentByIdHandler(new Repository<RevisionComment>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetRevisionCommentByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, null, null, null, OrgId, UserId), default);

        var handler = new UpdateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateRevisionCommentCommand(created.Id, null, null, null, null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, null, null, null, OrgId, UserId), default);

        var handler = new UpdateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateRevisionCommentCommand(created.Id, null, null, null, null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, null, null, null, OrgId, UserId), default);

        var handler = new DeleteRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteRevisionCommentCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, null, null, null, OrgId, UserId), default);

        var handler = new DeleteRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteRevisionCommentCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, null, null, null, OrgId, UserId), default);

        var handler = new GetRevisionCommentByIdHandler(new Repository<RevisionComment>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetRevisionCommentByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateRevisionCommentHandler(
            new Repository<RevisionComment>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateRevisionCommentCommand(story.Id, 0, 0, 1, null, null, null, OrgId, UserId), default);

        var handler = new GetRevisionCommentByIdHandler(new Repository<RevisionComment>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetRevisionCommentByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"RevisionComment_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "RevisionComment Test Story",
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
