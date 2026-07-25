using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DailyGoals.Commands;
using Versatile.Application.DailyGoals.Handlers;
using Versatile.Application.DailyGoals.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.IntegrationTests;

public sealed class DailyGoalCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task Create_WithValidData_ReturnsDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var handler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));

        var date = new DateTime(2025, 6, 1);
        var result = await handler.Handle(new CreateDailyGoalCommand(story.Id, date, 1000, OrgId, UserId), default);

        result.Should().NotBeNull();
        result.Date.Should().Be(date);
        result.TargetWords.Should().Be(1000);
        result.CurrentWords.Should().Be(0);
        result.Completed.Should().BeFalse();
        result.StoryId.Should().Be(story.Id);
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Create_WithMissingStory_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var handler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new CreateDailyGoalCommand(Guid.NewGuid(), DateTime.Today, 500, OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, new DateTime(2025, 6, 1), 1000, OrgId, UserId), default);

        var updateHandler = new UpdateDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateDailyGoalCommand(created.Id, new DateTime(2025, 6, 2), 2000, 500, true, OrgId, UserId), default);

        result.Date.Should().Be(new DateTime(2025, 6, 2));
        result.TargetWords.Should().Be(2000);
        result.CurrentWords.Should().Be(500);
        result.Completed.Should().BeTrue();
    }

    [Fact]
    public async Task Update_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, new DateTime(2025, 6, 1), 1000, OrgId, UserId), default);

        var updateHandler = new UpdateDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        var result = await updateHandler.Handle(new UpdateDailyGoalCommand(created.Id, null, null, CurrentWords: 300, null, OrgId, UserId), default);

        result.CurrentWords.Should().Be(300);
        result.TargetWords.Should().Be(1000);
        result.Date.Should().Be(new DateTime(2025, 6, 1));
        result.Completed.Should().BeFalse();
    }

    [Fact]
    public async Task Delete_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today, 500, OrgId, UserId), default);

        var deleteHandler = new DeleteDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));
        await deleteHandler.Handle(new DeleteDailyGoalCommand(created.Id, OrgId, UserId), default);

        var repo = new Repository<DailyGoal>(db);
        var entity = await repo.GetByIdAsync(created.Id);
        entity.Should().BeNull();
    }

    [Fact]
    public async Task Delete_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteDailyGoalCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetList_ReturnsItems()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today, 500, OrgId, UserId), default);
        await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today.AddDays(1), 1000, OrgId, UserId), default);

        var queryHandler = new GetDailyGoalsHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db));
        var result = await queryHandler.Handle(new GetDailyGoalsQuery(story.Id, OrgId, UserId), default);

        result.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetById_WithValidId_ReturnsDto()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today, 500, OrgId, UserId), default);

        var queryHandler = new GetDailyGoalByIdHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db));
        var result = await queryHandler.Handle(new GetDailyGoalByIdQuery(created.Id, OrgId, UserId), default);

        result.TargetWords.Should().Be(500);
    }

    [Fact]
    public async Task GetById_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetDailyGoalByIdHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetDailyGoalByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today, 500, OrgId, UserId), default);

        var handler = new UpdateDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateDailyGoalCommand(created.Id, null, null, null, null, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Update_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today, 500, OrgId, UserId), default);

        var handler = new UpdateDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new UpdateDailyGoalCommand(created.Id, null, null, null, null, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today, 500, OrgId, UserId), default);

        var handler = new DeleteDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteDailyGoalCommand(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Delete_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today, 500, OrgId, UserId), default);

        var handler = new DeleteDailyGoalHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new DeleteDailyGoalCommand(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongUserId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today, 500, OrgId, UserId), default);

        var handler = new GetDailyGoalByIdHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetDailyGoalByIdQuery(created.Id, OrgId, Guid.NewGuid()), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetById_WrongOrgId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var story = SeedStory(db);
        var createHandler = new CreateDailyGoalHandler(
            new OrganizationOwnedRepository<Story>(db),
            new Repository<DailyGoal>(db),
            new UnitOfWork(db));
        var created = await createHandler.Handle(new CreateDailyGoalCommand(story.Id, DateTime.Today, 500, OrgId, UserId), default);

        var handler = new GetDailyGoalByIdHandler(
            new Repository<DailyGoal>(db),
            new OrganizationOwnedRepository<Story>(db));

        await FluentActions
            .Awaiting(() => handler.Handle(new GetDailyGoalByIdQuery(created.Id, Guid.NewGuid(), UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"DailyGoal_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static Story SeedStory(ApplicationDbContext db)
    {
        var story = new Story
        {
            Id = Guid.NewGuid(),
            Title = "DailyGoal Test Story",
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
