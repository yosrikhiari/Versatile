using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.ResearchChunks.Commands;
using Versatile.Application.ResearchChunks.Handlers;
using Versatile.Application.ResearchChunks.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class ResearchChunkCrudIntegrationTests
{
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var doc = SeedResearchDocument(db);

        var handler = new CreateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateResearchChunkCommand(doc.Id, doc.StoryId, 0, "Sample content", "vector[]", UserId), default);

        result.Should().NotBeNull();
        result.DocumentId.Should().Be(doc.Id);
        result.StoryId.Should().Be(doc.StoryId);
        result.ChunkIndex.Should().Be(0);
        result.Content.Should().Be("Sample content");
        result.Embedding.Should().Be("vector[]");
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var doc = SeedResearchDocument(db);

        var handler = new CreateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateResearchChunkCommand(doc.Id, doc.StoryId, 1, null, null, UserId), default);

        result.Content.Should().BeNull();
        result.Embedding.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingResearchDocument_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateResearchChunkCommand(Guid.NewGuid(), Guid.NewGuid(), 0, "content", null, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var doc = SeedResearchDocument(db);
        var createHandler = new CreateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchChunkCommand(doc.Id, doc.StoryId, 0, "Original", "old-embed", UserId), default);

        var updateHandler = new UpdateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateResearchChunkCommand(created.Id, 1, "Updated content", "new-embed", UserId), default);

        result.ChunkIndex.Should().Be(1);
        result.Content.Should().Be("Updated content");
        result.Embedding.Should().Be("new-embed");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var doc = SeedResearchDocument(db);
        var createHandler = new CreateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchChunkCommand(doc.Id, doc.StoryId, 0, "Original content", "orig-embed", UserId), default);

        var updateHandler = new UpdateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateResearchChunkCommand(created.Id, ChunkIndex: null, Content: "Only content changed", Embedding: null, UserId), default);

        result.Content.Should().Be("Only content changed");
        result.Embedding.Should().Be("orig-embed");
        result.ChunkIndex.Should().Be(0);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var doc = SeedResearchDocument(db);
        var createHandler = new CreateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchChunkCommand(doc.Id, doc.StoryId, 0, "To Delete", null, UserId), default);

        var deleteHandler = new DeleteResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteResearchChunkCommand(created.Id, UserId), default);

        var repo = new Repository<ResearchChunk>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteResearchChunkCommand(Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItemsOrderedByChunkIndexAsc()
    {
        var db = CreateDbContext();
        var doc = SeedResearchDocument(db);
        var createHandler = new CreateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));
        var first = await createHandler.Handle(new CreateResearchChunkCommand(doc.Id, doc.StoryId, 0, "First", null, UserId), default);
        var second = await createHandler.Handle(new CreateResearchChunkCommand(doc.Id, doc.StoryId, 1, "Second", null, UserId), default);

        var queryHandler = new GetResearchChunksHandler(
            new Repository<ResearchChunk>(db));
        var result = await queryHandler.Handle(new GetResearchChunksQuery(doc.StoryId, UserId), default);

        result.Select(e => e.Id).Should().Equal(first.Id, second.Id);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var doc = SeedResearchDocument(db);
        var createHandler = new CreateResearchChunkHandler(
            new Repository<ResearchChunk>(db),
            new Repository<ResearchDocument>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateResearchChunkCommand(doc.Id, doc.StoryId, 0, "Find Me", null, UserId), default);

        var queryHandler = new GetResearchChunkByIdHandler(
            new Repository<ResearchChunk>(db));
        var result = await queryHandler.Handle(new GetResearchChunkByIdQuery(created.Id, UserId), default);

        result.Content.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetResearchChunkByIdHandler(
            new Repository<ResearchChunk>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetResearchChunkByIdQuery(Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"ResearchChunk_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static ResearchDocument SeedResearchDocument(ApplicationDbContext db)
    {
        var doc = new ResearchDocument { Id = Guid.NewGuid(), FileName = "test.doc", UserId = UserId };
        db.Set<ResearchDocument>().Add(doc);
        db.SaveChanges();
        return doc;
    }

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
