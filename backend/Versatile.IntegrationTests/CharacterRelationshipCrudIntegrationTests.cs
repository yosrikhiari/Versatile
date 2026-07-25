using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.CharacterRelationships.Commands;
using Versatile.Application.CharacterRelationships.Handlers;
using Versatile.Application.CharacterRelationships.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class CharacterRelationshipCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));

        var fromId = Guid.NewGuid();
        var toId = Guid.NewGuid();
        var result = await handler.Handle(new CreateCharacterRelationshipCommand(story.Id, fromId, toId, "Friend", "Notes", OrgId, UserId), default);

        result.Should().NotBeNull();
        result.FromCharacterId.Should().Be(fromId);
        result.ToCharacterId.Should().Be(toId);
        result.RelationshipType.Should().Be("Friend");
        result.Notes.Should().Be("Notes");
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithNullNotes_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Rival", null, OrgId, UserId), default);

        result.Notes.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateCharacterRelationshipCommand(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "Type", null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var fromId = Guid.NewGuid();
        var toId = Guid.NewGuid();
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, fromId, toId, "Friend", "Old notes", OrgId, UserId), default);

        var updateHandler = new UpdateCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var newFrom = Guid.NewGuid();
        var result = await updateHandler.Handle(new UpdateCharacterRelationshipCommand(created.Id, newFrom, null, "Enemy", "New notes", OrgId, UserId), default);

        result.FromCharacterId.Should().Be(newFrom);
        result.ToCharacterId.Should().Be(toId);
        result.RelationshipType.Should().Be("Enemy");
        result.Notes.Should().Be("New notes");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var fromId = Guid.NewGuid();
        var toId = Guid.NewGuid();
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, fromId, toId, "Friend", "Notes", OrgId, UserId), default);

        var updateHandler = new UpdateCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateCharacterRelationshipCommand(created.Id, FromCharacterId: null, null, RelationshipType: "Rival", null, OrgId, UserId), default);

        result.RelationshipType.Should().Be("Rival");
        result.FromCharacterId.Should().Be(fromId);
        result.ToCharacterId.Should().Be(toId);
        result.Notes.Should().Be("Notes");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Friend", null, OrgId, UserId), default);

        var deleteHandler = new DeleteCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteCharacterRelationshipCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<CharacterRelationship>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteCharacterRelationshipCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Friend", null, OrgId, UserId), default);
        await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Rival", null, OrgId, UserId), default);

        var queryHandler = new GetCharacterRelationshipsHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db));
        var result = await queryHandler.Handle(new GetCharacterRelationshipsQuery(story.Id, OrgId, UserId), default);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Friend", null, OrgId, UserId), default);

        var queryHandler = new GetCharacterRelationshipByIdHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetCharacterRelationshipByIdQuery(created.Id, OrgId, UserId), default);

        result.RelationshipType.Should().Be("Friend");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetCharacterRelationshipByIdHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetCharacterRelationshipByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Friend", null, OrgId, UserId), default);

        var handler = new UpdateCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateCharacterRelationshipCommand(created.Id, null, null, "Hacked", null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Friend", null, OrgId, UserId), default);

        var handler = new UpdateCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateCharacterRelationshipCommand(created.Id, null, null, "Hacked", null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Friend", null, OrgId, UserId), default);

        var handler = new DeleteCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteCharacterRelationshipCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Friend", null, OrgId, UserId), default);

        var handler = new DeleteCharacterRelationshipHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteCharacterRelationshipCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Friend", null, OrgId, UserId), default);

        var handler = new GetCharacterRelationshipByIdHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetCharacterRelationshipByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateCharacterRelationshipHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<CharacterRelationship>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateCharacterRelationshipCommand(story.Id, Guid.NewGuid(), Guid.NewGuid(), "Friend", null, OrgId, UserId), default);

        var handler = new GetCharacterRelationshipByIdHandler(
            new Repository<CharacterRelationship>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetCharacterRelationshipByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"CharacterRelationship_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "CharacterRelationship Test Story",
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
