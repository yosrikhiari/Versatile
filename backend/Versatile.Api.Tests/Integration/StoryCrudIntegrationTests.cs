using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Stories.Commands;
using Versatile.Application.Stories.Handlers;
using Versatile.Application.Stories.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Versatile.Infrastructure.Data;
using Versatile.Infrastructure.Repositories;

namespace Versatile.Api.Tests.Integration;

public sealed class StoryCrudIntegrationTests
{
    private static readonly Guid OrgId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    [Fact]
    public async Task CreateStory_WithValidData_ReturnsStoryDtoWithCorrectValues()
    {
        var db = CreateDbContext();
        var handler = CreateStoryHandler(db);

        var command = new CreateStoryCommand(
            Title: "My Novel",
            Premise: "A hero rises",
            Genre: "Fantasy",
            Tone: "Epic",
            WritingStyle: "Descriptive",
            TargetAudience: "YA",
            OrganizationId: OrgId,
            UserId: UserId
        );

        var result = await handler.Handle(command, default);

        result.Should().NotBeNull();
        result.Title.Should().Be("My Novel");
        result.Premise.Should().Be("A hero rises");
        result.Genre.Should().Be("Fantasy");
        result.Tone.Should().Be("Epic");
        result.WritingStyle.Should().Be("Descriptive");
        result.TargetAudience.Should().Be("YA");
        result.Id.Should().NotBeEmpty();
    }

    [Fact]
    public async Task CreateStory_WithAllOptionalFieldsNull_Works()
    {
        var db = CreateDbContext();
        var handler = CreateStoryHandler(db);

        var result = await handler.Handle(new CreateStoryCommand("Minimal", null, null, null, null, null, OrgId, UserId), default);

        result.Title.Should().Be("Minimal");
        result.Premise.Should().BeNull();
        result.Genre.Should().BeNull();
        result.Tone.Should().BeNull();
        result.WritingStyle.Should().BeNull();
        result.TargetAudience.Should().BeNull();
    }

    [Fact]
    public async Task UpdateStory_WithValidData_UpdatesAndReturnsUpdatedDto()
    {
        var db = CreateDbContext();
        var handler = CreateStoryHandler(db);
        var created = await handler.Handle(new CreateStoryCommand("Original", "Old premise", "Fantasy", null, null, null, OrgId, UserId), default);

        var updateHandler = new UpdateStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db)
        );
        var updateCommand = new UpdateStoryCommand(
            Id: created.Id,
            Title: "Updated Novel",
            Premise: "New premise",
            Genre: "Sci-Fi",
            Tone: "Dark",
            WritingStyle: "Concise",
            TargetAudience: "Adult",
            OrganizationId: OrgId,
            UserId: UserId
        );

        var result = await updateHandler.Handle(updateCommand, default);

        result.Title.Should().Be("Updated Novel");
        result.Premise.Should().Be("New premise");
        result.Genre.Should().Be("Sci-Fi");
        result.Tone.Should().Be("Dark");
        result.WritingStyle.Should().Be("Concise");
        result.TargetAudience.Should().Be("Adult");
        result.UpdatedAt.Should().BeAfter(created.CreatedAt);
    }

    [Fact]
    public async Task UpdateStory_PartialUpdate_OnlyUpdatesProvidedFields()
    {
        var db = CreateDbContext();
        var handler = CreateStoryHandler(db);
        var created = await handler.Handle(new CreateStoryCommand("Original", "Premise", "Fantasy", null, null, null, OrgId, UserId), default);

        var updateHandler = new UpdateStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db)
        );

        var result = await updateHandler.Handle(new UpdateStoryCommand(created.Id, Title: "Only Title Changed", null, null, null, null, null, OrgId, UserId), default);

        result.Title.Should().Be("Only Title Changed");
        result.Premise.Should().Be("Premise");
        result.Genre.Should().Be("Fantasy");
    }

    [Fact]
    public async Task DeleteStory_WithValidData_RemovesEntity()
    {
        var db = CreateDbContext();
        var handler = CreateStoryHandler(db);
        var created = await handler.Handle(new CreateStoryCommand("To Delete", null, null, null, null, null, OrgId, UserId), default);

        var deleteHandler = new DeleteStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db)
        );
        await deleteHandler.Handle(new DeleteStoryCommand(created.Id, OrgId, UserId), default);

        var repo = new OrganizationOwnedRepository<Story>(db);
        var story = await repo.GetByIdForOrganizationAsync(created.Id, OrgId);
        story.Should().BeNull();
    }

    [Fact]
    public async Task DeleteStory_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var deleteHandler = new DeleteStoryHandler(
            new OrganizationOwnedRepository<Story>(db),
            new UnitOfWork(db)
        );

        await FluentActions
            .Awaiting(() => deleteHandler.Handle(new DeleteStoryCommand(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetStoriesQuery_ReturnsStoriesOrderedByUpdatedAtDesc()
    {
        var db = CreateDbContext();
        var handler = CreateStoryHandler(db);

        var first = await handler.Handle(new CreateStoryCommand("B", null, null, null, null, null, OrgId, UserId), default);
        await Task.Delay(10);
        var second = await handler.Handle(new CreateStoryCommand("A", null, null, null, null, null, OrgId, UserId), default);

        var queryHandler = new GetStoriesHandler(new Repository<Story>(db));
        var result = await queryHandler.Handle(new GetStoriesQuery(OrgId, UserId, PageSize: 10), default);

        result.Items.Select(s => s.Id).Should().Equal(second.Id, first.Id);
    }

    [Fact]
    public async Task GetStoryByIdQuery_WithValidId_ReturnsStory()
    {
        var db = CreateDbContext();
        var handler = CreateStoryHandler(db);
        var created = await handler.Handle(new CreateStoryCommand("Find Me", "Test premise", null, null, null, null, OrgId, UserId), default);

        var queryHandler = new GetStoryByIdHandler(new Repository<Story>(db));
        var result = await queryHandler.Handle(new GetStoryByIdQuery(created.Id, OrgId, UserId), default);

        result.Title.Should().Be("Find Me");
        result.Premise.Should().Be("Test premise");
    }

    [Fact]
    public async Task GetStoryByIdQuery_WithWrongId_ThrowsKeyNotFoundException()
    {
        var db = CreateDbContext();
        var queryHandler = new GetStoryByIdHandler(new Repository<Story>(db));

        await FluentActions
            .Awaiting(() => queryHandler.Handle(new GetStoryByIdQuery(Guid.NewGuid(), OrgId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task CreateStory_SetsCreatedAtTimestamp()
    {
        var db = CreateDbContext();
        var handler = CreateStoryHandler(db);
        var before = DateTime.UtcNow;

        var result = await handler.Handle(new CreateStoryCommand("Timestamp Test", null, null, null, null, null, OrgId, UserId), default);
        var after = DateTime.UtcNow;

        result.CreatedAt.Should().BeOnOrAfter(before.AddSeconds(-1));
        result.CreatedAt.Should().BeOnOrBefore(after.AddSeconds(1));
        result.UpdatedAt.Should().BeCloseTo(result.CreatedAt, TimeSpan.FromMilliseconds(10));
    }

    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"StoryCrud_{Guid.NewGuid()}")
            .Options;
        return new ApplicationDbContext(options, new NullOrganizationContext());
    }

    private static CreateStoryHandler CreateStoryHandler(ApplicationDbContext db) =>
        new(new Repository<Story>(db), new UnitOfWork(db));

    private sealed class NullOrganizationContext : IOrganizationContext
    {
        public Guid? OrganizationId => null;
        public string? OrganizationRole => null;
        public void SetOrganization(Guid? organizationId, string? organizationRole) { }
    }
}
