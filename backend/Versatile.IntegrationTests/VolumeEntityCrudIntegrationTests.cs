using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.VolumeEntities.Commands;
using Versatile.Application.VolumeEntities.Handlers;
using Versatile.Application.VolumeEntities.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class VolumeEntityCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var handler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-123", true, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.EntityType.Should().Be("Character");
        result.EntityId.Should().Be("char-123");
        result.IsPrimary.Should().BeTrue();
        result.StoryId.Should().Be(story.Id);
        result.VolumeId.Should().Be(volume.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateVolumeEntityCommand(Guid.NewGuid(), Guid.NewGuid(), "Character", "id", false, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Create_WithMissingVolume_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateVolumeEntityCommand(story.Id, Guid.NewGuid(), "Character", "id", false, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var updateHandler = new UpdateVolumeEntityHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateVolumeEntityCommand(created.Id, null, "Location", "loc-1", false, OrgId, UserId), default);

        result.EntityType.Should().Be("Location");
        result.EntityId.Should().Be("loc-1");
        result.IsPrimary.Should().BeFalse();
        result.VolumeId.Should().Be(volume.Id);
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var updateHandler = new UpdateVolumeEntityHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateVolumeEntityCommand(created.Id, EntityType: "Plot", EntityId: null, IsPrimary: null, VolumeId: null, OrganizationId: OrgId, UserId: UserId), default);

        result.EntityType.Should().Be("Plot");
        result.EntityId.Should().Be("char-1");
        result.IsPrimary.Should().BeTrue();
    }

    [Fact]
    public async Task Update_WithNewVolume_UpdatesVolumeId()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume1 = SeedVolume(db, story.Id);
        var volume2 = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume1.Id, "Character", "char-1", true, OrgId, UserId), default);

        var updateHandler = new UpdateVolumeEntityHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateVolumeEntityCommand(created.Id, VolumeId: volume2.Id, EntityType: null, EntityId: null, IsPrimary: null, OrganizationId: OrgId, UserId: UserId), default);

        result.VolumeId.Should().Be(volume2.Id);
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var deleteHandler = new DeleteVolumeEntityHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteVolumeEntityCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<VolumeEntity>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteVolumeEntityHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteVolumeEntityCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);
        await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Location", "loc-1", false, OrgId, UserId), default);

        var queryHandler = new GetVolumeEntitiesHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetVolumeEntitiesQuery(story.Id, OrgId, UserId), default);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var queryHandler = new GetVolumeEntityByIdHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetVolumeEntityByIdQuery(created.Id, OrgId, UserId), default);

        result.EntityType.Should().Be("Character");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetVolumeEntityByIdHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetVolumeEntityByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var handler = new UpdateVolumeEntityHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateVolumeEntityCommand(created.Id, null, "Hacked", null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var handler = new UpdateVolumeEntityHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateVolumeEntityCommand(created.Id, null, "Hacked", null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var handler = new DeleteVolumeEntityHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteVolumeEntityCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var handler = new DeleteVolumeEntityHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteVolumeEntityCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var handler = new GetVolumeEntityByIdHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetVolumeEntityByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var volume = SeedVolume(db, story.Id);
        var createHandler = new CreateVolumeEntityHandler(
            new OrganizationOwnedRepository<Story>(db),
            new OrganizationOwnedRepository<Volume>(db),
            new Repository<VolumeEntity>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateVolumeEntityCommand(story.Id, volume.Id, "Character", "char-1", true, OrgId, UserId), default);

        var handler = new GetVolumeEntityByIdHandler(
            new Repository<VolumeEntity>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetVolumeEntityByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"VolumeEntity_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "VolumeEntity Test Story",
            UserId = UserId,
            OrganizationId = OrgId
        };
        db.Set<Story>().Add(story);
        db.SaveChanges();
        return story;
    }

    private static Volume SeedVolume(ApplicationDbContext db, Guid storyId)
    {
        var volume = new Volume
        {
            Id = Guid.NewGuid(),
            Title = "Test Volume",
            StoryId = storyId,
            UserId = UserId,
            OrganizationId = OrgId,
            Color = "#333333"
        };
        db.Set<Volume>().Add(volume);
        db.SaveChanges();
        return volume;
    }

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
