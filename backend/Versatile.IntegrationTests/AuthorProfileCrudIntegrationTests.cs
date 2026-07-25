using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.AuthorProfiles.Commands;
using Versatile.Application.AuthorProfiles.Handlers;
using Versatile.Application.AuthorProfiles.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class AuthorProfileCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateAuthorProfileCommand(story.Id, "John Doe", "JD", "A bio", null, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.DisplayName.Should().Be("John Doe");
        result.PenName.Should().Be("JD");
        result.Bio.Should().Be("A bio");
        result.Settings.Should().BeNull();
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));

        var result = await handler.Handle(new CreateAuthorProfileCommand(story.Id, "Name", "Pen", null, null, OrgId, UserId), default);

        result.Bio.Should().BeNull();
        result.Settings.Should().BeNull();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateAuthorProfileCommand(Guid.NewGuid(), "Name", "Pen", null, null, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "Original", "OP", "Old bio", null, OrgId, UserId), default);

        var updateHandler = new UpdateAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateAuthorProfileCommand(created.Id, "Updated", "UP", "New bio", "{}", OrgId, UserId), default);

        result.DisplayName.Should().Be("Updated");
        result.PenName.Should().Be("UP");
        result.Bio.Should().Be("New bio");
        result.Settings.Should().Be("{}");
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "Original", "OP", "Bio", null, OrgId, UserId), default);

        var updateHandler = new UpdateAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateAuthorProfileCommand(created.Id, DisplayName: "Only Display Changed", null, null, null, OrgId, UserId), default);

        result.DisplayName.Should().Be("Only Display Changed");
        result.PenName.Should().Be("OP");
        result.Bio.Should().Be("Bio");
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "To Delete", "TD", null, null, OrgId, UserId), default);

        var deleteHandler = new DeleteAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteAuthorProfileCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<AuthorProfile>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteAuthorProfileCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "A", "PenA", null, null, OrgId, UserId), default);
        await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "B", "PenB", null, null, OrgId, UserId), default);

        var queryHandler = new GetAuthorProfilesHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db));
        var result = await queryHandler.Handle(new GetAuthorProfilesQuery(story.Id, OrgId, UserId), default);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "Find Me", "FM", null, null, OrgId, UserId), default);

        var queryHandler = new GetAuthorProfileByIdHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetAuthorProfileByIdQuery(created.Id, OrgId, UserId), default);

        result.DisplayName.Should().Be("Find Me");
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetAuthorProfileByIdHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetAuthorProfileByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "Title", "Pen", null, null, OrgId, UserId), default);

        var handler = new UpdateAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateAuthorProfileCommand(created.Id, "Hacked", null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "Title", "Pen", null, null, OrgId, UserId), default);

        var handler = new UpdateAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateAuthorProfileCommand(created.Id, "Hacked", null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "Title", "Pen", null, null, OrgId, UserId), default);

        var handler = new DeleteAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteAuthorProfileCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "Title", "Pen", null, null, OrgId, UserId), default);

        var handler = new DeleteAuthorProfileHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteAuthorProfileCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "Title", "Pen", null, null, OrgId, UserId), default);

        var handler = new GetAuthorProfileByIdHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetAuthorProfileByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateAuthorProfileHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<AuthorProfile>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateAuthorProfileCommand(story.Id, "Title", "Pen", null, null, OrgId, UserId), default);

        var handler = new GetAuthorProfileByIdHandler(
            new Repository<AuthorProfile>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetAuthorProfileByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"AuthorProfile_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "AuthorProfile Test Story",
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
