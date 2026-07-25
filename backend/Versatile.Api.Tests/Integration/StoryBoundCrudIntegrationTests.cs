using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.AuthorProfiles.Commands;
using Versatile.Application.AuthorProfiles.Handlers;
using Versatile.Application.CharacterRelationships.Commands;
using Versatile.Application.CharacterRelationships.Handlers;
using Versatile.Application.DailyGoals.Commands;
using Versatile.Application.DailyGoals.Handlers;
using Versatile.Application.DTOs;
using Versatile.Application.Entities.Commands;
using Versatile.Application.Entities.Handlers;
using Versatile.Application.GeneratedStories.Commands;
using Versatile.Application.GeneratedStories.Handlers;
using Versatile.Application.Manuscripts.Commands;
using Versatile.Application.Manuscripts.Handlers;
using Versatile.Application.PlotThreads.Commands;
using Versatile.Application.PlotThreads.Handlers;
using Versatile.Application.StoryDocuments.Commands;
using Versatile.Application.StoryDocuments.Handlers;
using Versatile.Application.StoryElements.Commands;
using Versatile.Application.StoryElements.Handlers;
using Versatile.Application.VoiceProfiles.Commands;
using Versatile.Application.VoiceProfiles.Handlers;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;
using StoryEntity = Versatile.Domain.Entities.Story;

namespace Versatile.Api.Tests.Integration;

public sealed class StoryBoundCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    // ─── AuthorProfile ──────────────────────────────────────────────────────

    [Fact]
    public async Task CreateAuthorProfile_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateAuthorProfileHandler(db);

        var command = new CreateAuthorProfileCommand(
            StoryId: story.Id,
            DisplayName: "Jane",
            PenName: "J.D.",
            Bio: "Writer",
            Settings: "{}",
            OrganizationId: OrgId,
            UserId: UserId
        );

        var result = await handler.Handle(command, default);

        result.Should().NotBeNull();
        result.DisplayName.Should().Be("Jane");
        result.PenName.Should().Be("J.D.");
        result.Bio.Should().Be("Writer");
        result.Settings.Should().Be("{}");
        result.StoryId.Should().Be(story.Id);
    }

    [Fact]
    public async Task CreateAuthorProfile_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateAuthorProfileHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateAuthorProfileCommand(Guid.NewGuid(), "X", "Y", null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateAuthorProfile_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateAuthorProfileHandler(db).Handle(
            new CreateAuthorProfileCommand(story.Id, "Original", "Orig", "Bio", "{}", OrgId, UserId), default);

        var updateHandler = new UpdateAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdateAuthorProfileCommand(created.Id, "Updated", "UPD", null, "{\"theme\":\"dark\"}", OrgId, UserId), default);

        result.DisplayName.Should().Be("Updated");
        result.PenName.Should().Be("UPD");
        result.Settings.Should().Be("{\"theme\":\"dark\"}");
        result.Bio.Should().Be("Bio");
    }

    [Fact]
    public async Task DeleteAuthorProfile_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateAuthorProfileHandler(db).Handle(
            new CreateAuthorProfileCommand(story.Id, "To Delete", "TD", null, null, OrgId, UserId), default);

        var deleteHandler = new DeleteAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteAuthorProfileCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<AuthorProfile>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task DeleteAuthorProfile_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteAuthorProfileCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    // ─── CharacterRelationship ──────────────────────────────────────────────

    [Fact]
    public async Task CreateCharacterRelationship_WithValidData_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateCharacterRelationshipHandler(db);

        var result = await handler.Handle(
            new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "friend", "Met at school", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.RelationshipType.Should().Be("friend");
        result.Notes.Should().Be("Met at school");
        result.StoryId.Should().Be(story.Id);
    }

    [Fact]
    public async Task CreateCharacterRelationship_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateCharacterRelationshipHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateCharacterRelationshipCommand(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "rival", null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateCharacterRelationship_WithValidData_UpdatesFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateCharacterRelationshipHandler(db).Handle(
            new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "friend", "Old notes", OrgId, UserId), default);

        var updateHandler = new UpdateCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdateCharacterRelationshipCommand(created.Id, null, null, "enemy", "New notes", OrgId, UserId), default);

        result.RelationshipType.Should().Be("enemy");
        result.Notes.Should().Be("New notes");
    }

    [Fact]
    public async Task DeleteCharacterRelationship_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateCharacterRelationshipHandler(db).Handle(
            new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "friend", null, OrgId, UserId), default);

        var deleteHandler = new DeleteCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteCharacterRelationshipCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<CharacterRelationship>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    // ─── DailyGoal ──────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateDailyGoal_WithValidData_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateDailyGoalHandler(db);

        var result = await handler.Handle(
            new CreateDailyGoalCommand(story.Id, new DateTime(2025, 1, 1), 1000, OrgId, UserId), default);

        result.Date.Should().Be(new DateTime(2025, 1, 1));
        result.TargetWords.Should().Be(1000);
        result.CurrentWords.Should().Be(0);
        result.Completed.Should().BeFalse();
    }

    [Fact]
    public async Task CreateDailyGoal_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateDailyGoalHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateDailyGoalCommand(Guid.NewGuid(), DateTime.UtcNow, 500, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateDailyGoal_WithValidData_UpdatesFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateDailyGoalHandler(db).Handle(
            new CreateDailyGoalCommand(story.Id, new DateTime(2025, 1, 1), 1000, OrgId, UserId), default);

        var updateHandler = new UpdateDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdateDailyGoalCommand(created.Id, null, 2000, 500, true, OrgId, UserId), default);

        result.TargetWords.Should().Be(2000);
        result.CurrentWords.Should().Be(500);
        result.Completed.Should().BeTrue();
    }

    [Fact]
    public async Task DeleteDailyGoal_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateDailyGoalHandler(db).Handle(
            new CreateDailyGoalCommand(story.Id, new DateTime(2025, 1, 1), 500, OrgId, UserId), default);

        var deleteHandler = new DeleteDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteDailyGoalCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<DailyGoal>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    // ─── Entity (generic) ──────────────────────────────────────────────────

    [Fact]
    public async Task CreateEntity_WithValidData_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateEntityHandler(db);

        var result = await handler.Handle(
            new CreateEntityCommand(story.Id, "Sword", "item", "A legendary blade", "{\"damage\":10}", OrgId, UserId), default);

        result.Name.Should().Be("Sword");
        result.Type.Should().Be("item");
        result.Description.Should().Be("A legendary blade");
        result.Metadata.Should().Be("{\"damage\":10}");
    }

    [Fact]
    public async Task CreateEntity_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateEntityHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateEntityCommand(Guid.NewGuid(), "N", "t", null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateEntity_WithValidData_UpdatesFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateEntityHandler(db).Handle(
            new CreateEntityCommand(story.Id, "Old", "item", "Old desc", null, OrgId, UserId), default);

        var updateHandler = new UpdateEntityHandler(
            new Repository<Domain.Entities.Entity>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdateEntityCommand(created.Id, "Updated", "character", "New desc", "{\"age\":30}", OrgId, UserId), default);

        result.Name.Should().Be("Updated");
        result.Type.Should().Be("character");
        result.Description.Should().Be("New desc");
        result.Metadata.Should().Be("{\"age\":30}");
    }

    [Fact]
    public async Task DeleteEntity_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateEntityHandler(db).Handle(
            new CreateEntityCommand(story.Id, "To Delete", "item", "del desc", null, OrgId, UserId), default);

        var deleteHandler = new DeleteEntityHandler(
            new Repository<Domain.Entities.Entity>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteEntityCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<Domain.Entities.Entity>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    // ─── GeneratedStory ─────────────────────────────────────────────────────

    [Fact]
    public async Task CreateGeneratedStory_WithValidData_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateGeneratedStoryHandler(db);

        var result = await handler.Handle(
            new CreateGeneratedStoryCommand(story.Id, "AI Story", "Once upon an AI", 500, 0.95, OrgId, UserId), default);

        result.Title.Should().Be("AI Story");
        result.Content.Should().Be("Once upon an AI");
        result.TotalWords.Should().Be(500);
        result.QualityScore.Should().Be(0.95);
    }

    [Fact]
    public async Task CreateGeneratedStory_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateGeneratedStoryHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateGeneratedStoryCommand(Guid.NewGuid(), "X", null, 0, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateGeneratedStory_WithValidData_UpdatesFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateGeneratedStoryHandler(db).Handle(
            new CreateGeneratedStoryCommand(story.Id, "Original", "Content", 100, 0.5, OrgId, UserId), default);

        var updateHandler = new UpdateGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdateGeneratedStoryCommand(created.Id, "Updated", "New content", 200, 0.9, OrgId, UserId), default);

        result.Title.Should().Be("Updated");
        result.TotalWords.Should().Be(200);
        result.QualityScore.Should().Be(0.9);
    }

    [Fact]
    public async Task DeleteGeneratedStory_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateGeneratedStoryHandler(db).Handle(
            new CreateGeneratedStoryCommand(story.Id, "To Delete", null, 0, null, OrgId, UserId), default);

        var deleteHandler = new DeleteGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteGeneratedStoryCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<GeneratedStory>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    // ─── Manuscript ─────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateManuscript_WithValidData_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateManuscriptHandler(db);

        var result = await handler.Handle(
            new CreateManuscriptCommand(story.Id, "Chapter 1", "It was a dark night", 0, OrgId, UserId), default);

        result.Title.Should().Be("Chapter 1");
        result.Content.Should().Be("It was a dark night");
        result.WordCount.Should().Be(5);
    }

    [Fact]
    public async Task CreateManuscript_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateManuscriptHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateManuscriptCommand(Guid.NewGuid(), "X", null, 0, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateManuscript_WithValidData_UpdatesFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateManuscriptHandler(db).Handle(
            new CreateManuscriptCommand(story.Id, "Original", "Some text", 0, OrgId, UserId), default);

        var updateHandler = new UpdateManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdateManuscriptCommand(created.Id, "Revised", "Brand new content here", null, OrgId, UserId), default);

        result.Title.Should().Be("Revised");
        result.WordCount.Should().Be(4);
    }

    [Fact]
    public async Task DeleteManuscript_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateManuscriptHandler(db).Handle(
            new CreateManuscriptCommand(story.Id, "To Delete", "content", 0, OrgId, UserId), default);

        var deleteHandler = new DeleteManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteManuscriptCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<Manuscript>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    // ─── PlotThread ─────────────────────────────────────────────────────────

    [Fact]
    public async Task CreatePlotThread_WithValidData_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreatePlotThreadHandler(db);

        var result = await handler.Handle(
            new CreatePlotThreadCommand(story.Id, "Main Plot", "active", "Key events", 1, OrgId, UserId), default);

        result.Title.Should().Be("Main Plot");
        result.Status.Should().Be("active");
        result.Notes.Should().Be("Key events");
        result.Order.Should().Be(1);
    }

    [Fact]
    public async Task CreatePlotThread_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreatePlotThreadHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreatePlotThreadCommand(Guid.NewGuid(), "X", "active", null, 0, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdatePlotThread_WithValidData_UpdatesFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreatePlotThreadHandler(db).Handle(
            new CreatePlotThreadCommand(story.Id, "Original", "active", "Old notes", 1, OrgId, UserId), default);

        var updateHandler = new UpdatePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdatePlotThreadCommand(created.Id, "Revised", "resolved", "New notes", 2, OrgId, UserId), default);

        result.Title.Should().Be("Revised");
        result.Status.Should().Be("resolved");
        result.Notes.Should().Be("New notes");
        result.Order.Should().Be(2);
    }

    [Fact]
    public async Task DeletePlotThread_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreatePlotThreadHandler(db).Handle(
            new CreatePlotThreadCommand(story.Id, "To Delete", "active", null, 1, OrgId, UserId), default);

        var deleteHandler = new DeletePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeletePlotThreadCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<PlotThread>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    // ─── StoryDocument ──────────────────────────────────────────────────────

    [Fact]
    public async Task CreateStoryDocument_WithValidData_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateStoryDocumentHandler(db);

        var result = await handler.Handle(
            new CreateStoryDocumentCommand(story.Id, "research", "World Bible", "Deep lore", OrgId, UserId), default);

        result.DocType.Should().Be("research");
        result.Title.Should().Be("World Bible");
        result.Content.Should().Be("Deep lore");
    }

    [Fact]
    public async Task CreateStoryDocument_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateStoryDocumentHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateStoryDocumentCommand(Guid.NewGuid(), "note", "X", null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateStoryDocument_WithValidData_UpdatesFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateStoryDocumentHandler(db).Handle(
            new CreateStoryDocumentCommand(story.Id, "note", "Original", "Old content", OrgId, UserId), default);

        var updateHandler = new UpdateStoryDocumentHandler(
            new Repository<StoryDocument>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdateStoryDocumentCommand(created.Id, "research", "Revised", "New content", OrgId, UserId), default);

        result.DocType.Should().Be("research");
        result.Title.Should().Be("Revised");
        result.Content.Should().Be("New content");
    }

    [Fact]
    public async Task DeleteStoryDocument_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateStoryDocumentHandler(db).Handle(
            new CreateStoryDocumentCommand(story.Id, "note", "To Delete", null, OrgId, UserId), default);

        var deleteHandler = new DeleteStoryDocumentHandler(
            new Repository<StoryDocument>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteStoryDocumentCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<StoryDocument>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    // ─── StoryElement ───────────────────────────────────────────────────────

    [Fact]
    public async Task CreateStoryElement_WithValidData_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateStoryElementHandler(db);

        var result = await handler.Handle(
            new CreateStoryElementCommand(story.Id, "character", "Hero", 100, 200, 50, 80, "{\"hp\":100}", OrgId, UserId), default);

        result.Type.Should().Be("character");
        result.Title.Should().Be("Hero");
        result.X.Should().Be(100);
        result.Y.Should().Be(200);
        result.Width.Should().Be(50);
        result.Height.Should().Be(80);
        result.Data.Should().Be("{\"hp\":100}");
    }

    [Fact]
    public async Task CreateStoryElement_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateStoryElementHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateStoryElementCommand(Guid.NewGuid(), "note", "X", 0, 0, 0, 0, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateStoryElement_WithValidData_UpdatesFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateStoryElementHandler(db).Handle(
            new CreateStoryElementCommand(story.Id, "note", "Original", 0, 0, 100, 100, "{}", OrgId, UserId), default);

        var updateHandler = new UpdateStoryElementHandler(
            new Repository<StoryElement>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdateStoryElementCommand(created.Id, "scene", "Revised", 10, 20, 200, 300, "{\"key\":\"val\"}", OrgId, UserId), default);

        result.Type.Should().Be("scene");
        result.Title.Should().Be("Revised");
        result.X.Should().Be(10);
        result.Y.Should().Be(20);
        result.Width.Should().Be(200);
        result.Height.Should().Be(300);
        result.Data.Should().Be("{\"key\":\"val\"}");
    }

    [Fact]
    public async Task DeleteStoryElement_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateStoryElementHandler(db).Handle(
            new CreateStoryElementCommand(story.Id, "note", "To Delete", 0, 0, 0, 0, null, OrgId, UserId), default);

        var deleteHandler = new DeleteStoryElementHandler(
            new Repository<StoryElement>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteStoryElementCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<StoryElement>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    // ─── VoiceProfile ───────────────────────────────────────────────────────

    [Fact]
    public async Task CreateVoiceProfile_WithValidData_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = CreateVoiceProfileHandler(db);

        var result = await handler.Handle(
            new CreateVoiceProfileCommand(story.Id, "Narrator", "{\"pitch\":\"low\"}", OrgId, UserId), default);

        result.Name.Should().Be("Narrator");
        result.Settings.Should().Be("{\"pitch\":\"low\"}");
    }

    [Fact]
    public async Task CreateVoiceProfile_StoryNotFound_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = CreateVoiceProfileHandler(db);

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateVoiceProfileCommand(Guid.NewGuid(), "X", null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateVoiceProfile_WithValidData_UpdatesFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateVoiceProfileHandler(db).Handle(
            new CreateVoiceProfileCommand(story.Id, "Original", "{}", OrgId, UserId), default);

        var updateHandler = new UpdateVoiceProfileHandler(
            new Repository<VoiceProfile>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        var result = await updateHandler.Handle(
            new UpdateVoiceProfileCommand(created.Id, "Revised", "{\"pitch\":\"high\"}", OrgId, UserId), default);

        result.Name.Should().Be("Revised");
        result.Settings.Should().Be("{\"pitch\":\"high\"}");
    }

    [Fact]
    public async Task DeleteVoiceProfile_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var created = await CreateVoiceProfileHandler(db).Handle(
            new CreateVoiceProfileCommand(story.Id, "To Delete", null, OrgId, UserId), default);

        var deleteHandler = new DeleteVoiceProfileHandler(
            new Repository<VoiceProfile>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteVoiceProfileCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<VoiceProfile>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    // ─── Shared error cases ─────────────────────────────────────────────────

    [Fact]
    public async Task DeleteCharacterRelationship_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new DeleteCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteCharacterRelationshipCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteDailyGoal_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new DeleteDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteDailyGoalCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteEntity_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new DeleteEntityHandler(
            new Repository<Domain.Entities.Entity>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteEntityCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteGeneratedStory_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new DeleteGeneratedStoryHandler(
            new Repository<GeneratedStory>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteGeneratedStoryCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteManuscript_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new DeleteManuscriptHandler(
            new Repository<Manuscript>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteManuscriptCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeletePlotThread_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new DeletePlotThreadHandler(
            new Repository<PlotThread>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeletePlotThreadCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteStoryDocument_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new DeleteStoryDocumentHandler(
            new Repository<StoryDocument>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteStoryDocumentCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteStoryElement_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new DeleteStoryElementHandler(
            new Repository<StoryElement>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteStoryElementCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteVoiceProfile_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new DeleteVoiceProfileHandler(
            new Repository<VoiceProfile>(db),
            new OrganizationOwnedRepository<StoryEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteVoiceProfileCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"StoryBoundCrud_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static StoryEntity SeedStory(ApplicationDbContext db)
    {
        var story = new StoryEntity
        {
            Id = Guid.NewGuid(),
            Title = "Test Story",
            UserId = UserId,
            OrganizationId = OrgId
        };
        db.Set<StoryEntity>().Add(story);
        db.SaveChanges();
        return story;
    }

    private static CreateAuthorProfileHandler CreateAuthorProfileHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<AuthorProfile>(db), new UnitOfWork(db));

    private static CreateCharacterRelationshipHandler CreateCharacterRelationshipHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<CharacterRelationship>(db), new UnitOfWork(db));

    private static CreateDailyGoalHandler CreateDailyGoalHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<DailyGoal>(db), new UnitOfWork(db));

    private static CreateEntityHandler CreateEntityHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<Domain.Entities.Entity>(db), new UnitOfWork(db));

    private static CreateGeneratedStoryHandler CreateGeneratedStoryHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<GeneratedStory>(db), new UnitOfWork(db));

    private static CreateManuscriptHandler CreateManuscriptHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<Manuscript>(db), new UnitOfWork(db));

    private static CreatePlotThreadHandler CreatePlotThreadHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<PlotThread>(db), new UnitOfWork(db));

    private static CreateStoryDocumentHandler CreateStoryDocumentHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<StoryDocument>(db), new UnitOfWork(db));

    private static CreateStoryElementHandler CreateStoryElementHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<StoryElement>(db), new UnitOfWork(db));

    private static CreateVoiceProfileHandler CreateVoiceProfileHandler(ApplicationDbContext db) =>
        new(new OrganizationOwnedRepository<StoryEntity>(db), new Repository<VoiceProfile>(db), new UnitOfWork(db));

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
