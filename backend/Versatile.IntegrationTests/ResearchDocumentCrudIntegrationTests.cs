using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchDocuments.Commands;
using Versatile.Application.ResearchDocuments.Handlers;
using Versatile.Application.ResearchDocuments.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class ResearchDocumentCrudIntegrationTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateResearchDocumentCommand(story.Id, "doc.pdf", "pdf", "content", "notes", null, UserId), default);

        result.Should().NotBeNull();
        result.FileName.Should().Be("doc.pdf");
        result.FileType.Should().Be("pdf");
        result.Content.Should().Be("content");
        result.Notes.Should().Be("notes");
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateResearchDocumentCommand(story.Id, "doc.pdf", "pdf", null, null, null, UserId), default);

        result.Content.Should().BeNull();
        result.Notes.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateResearchDocumentCommand(Guid.NewGuid(), "doc.pdf", "pdf", null, null, null, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchDocumentCommand(story.Id, "old.pdf", "pdf", "old content", "old notes", null, UserId), default);

        var updateHandler = new UpdateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateResearchDocumentCommand(created.Id, "new.pdf", "docx", "new content", "new notes", null, UserId), default);

        result.FileName.Should().Be("new.pdf");
        result.FileType.Should().Be("docx");
        result.Content.Should().Be("new content");
        result.Notes.Should().Be("new notes");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchDocumentCommand(story.Id, "doc.pdf", "pdf", "content", "notes", null, UserId), default);

        var updateHandler = new UpdateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateResearchDocumentCommand(created.Id, FileName: "renamed.pdf", null, null, null, null, UserId), default);

        result.FileName.Should().Be("renamed.pdf");
        result.FileType.Should().Be("pdf");
        result.Content.Should().Be("content");
        result.Notes.Should().Be("notes");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchDocumentCommand(story.Id, "doc.pdf", "pdf", null, null, null, UserId), default);

        var deleteHandler = new DeleteResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteResearchDocumentCommand(created.Id, null, UserId), default);

        var repo = new Repository<ResearchDocument>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteResearchDocumentCommand(Guid.NewGuid(), null, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByImportedAtDesc()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateResearchDocumentCommand(story.Id, "B", "pdf", null, null, null, UserId), default);
        await Task.Delay(10);
        var second = await createHandler.Handle(new CreateResearchDocumentCommand(story.Id, "A", "pdf", null, null, null, UserId), default);

        var queryHandler = new GetResearchDocumentsHandler(
            new Repository<ResearchDocument>(db));
        var result = await queryHandler.Handle(new GetResearchDocumentsQuery(story.Id, null, UserId), default);

        result.Select(e => e.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchDocumentCommand(story.Id, "Find Me", "pdf", null, null, null, UserId), default);

        var queryHandler = new GetResearchDocumentByIdHandler(
            new Repository<ResearchDocument>(db));
        var result = await queryHandler.Handle(new GetResearchDocumentByIdQuery(created.Id, null, UserId), default);

        result.FileName.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetResearchDocumentByIdHandler(
            new Repository<ResearchDocument>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetResearchDocumentByIdQuery(Guid.NewGuid(), null, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchDocumentCommand(story.Id, "Title", "pdf", null, null, null, UserId), default);

        var handler = new UpdateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateResearchDocumentCommand(created.Id, "Hacked", null, null, null, null, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchDocumentCommand(story.Id, "Title", "pdf", null, null, null, UserId), default);

        var handler = new DeleteResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteResearchDocumentCommand(created.Id, null, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateResearchDocumentHandler(
            new Repository<ResearchDocument>(db),
            new Repository<Story>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchDocumentCommand(story.Id, "Title", "pdf", null, null, null, UserId), default);

        var handler = new GetResearchDocumentByIdHandler(
            new Repository<ResearchDocument>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetResearchDocumentByIdQuery(created.Id, null, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"ResearchDocument_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "ResearchDocument Test Story",
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