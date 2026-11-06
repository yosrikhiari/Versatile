using System.Linq.Expressions;
using FluentAssertions;
using Moq;
using Versatile.Application.Sync.Handlers;
using Versatile.Application.Sync.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Tests.Handlers;

public class GetSyncTombstonesHandlerTests
{
    private static readonly Guid StoryId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly Guid OtherUserId = Guid.NewGuid();
    private static readonly Guid OrganizationId = Guid.NewGuid();

    [Fact]
    public async Task ReturnsTombstonesForAnOwnedStory()
    {
        var story = new Story { Id = StoryId, UserId = UserId, OrganizationId = OrganizationId };
        var tombstone = Tombstone(UserId);
        var handler = CreateHandler(story, [tombstone]);

        var result = await handler.Handle(new GetSyncTombstonesQuery(StoryId, OrganizationId, UserId), default);

        result.Should().ContainSingle(t => t.RowId == tombstone.RowId && t.Table == "projects");
    }

    [Fact]
    public async Task ThrowsWhenStoryExistsButBelongsToAnotherUser()
    {
        var story = new Story { Id = StoryId, UserId = OtherUserId, OrganizationId = OrganizationId };
        var handler = CreateHandler(story, [Tombstone(OtherUserId)]);

        await handler.Invoking(h => h.Handle(new GetSyncTombstonesQuery(StoryId, OrganizationId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Story not found");
    }

    [Fact]
    public async Task ReturnsTombstonesAfterTheStoryWasDeleted()
    {
        var handler = CreateHandler(story: null, [Tombstone(UserId)]);

        var result = await handler.Handle(new GetSyncTombstonesQuery(StoryId, OrganizationId, UserId), default);

        result.Should().ContainSingle(t => t.Table == "projects" && t.StoryId == StoryId);
    }

    [Fact]
    public async Task ReturnsLegacyOwnerlessTombstonesAfterTheStoryWasDeleted()
    {
        var handler = CreateHandler(story: null, [Tombstone(Guid.Empty)]);

        var result = await handler.Handle(new GetSyncTombstonesQuery(StoryId, OrganizationId, UserId), default);

        result.Should().ContainSingle();
    }

    [Fact]
    public async Task ThrowsWhenDeletedStoryHadNoTombstonesForTheRequester()
    {
        var handler = CreateHandler(story: null, [Tombstone(OtherUserId)]);

        await handler.Invoking(h => h.Handle(new GetSyncTombstonesQuery(StoryId, OrganizationId, UserId), default))
            .Should().ThrowAsync<KeyNotFoundException>().WithMessage("Story not found");
    }

    private static GetSyncTombstonesHandler CreateHandler(Story? story, IReadOnlyCollection<SyncTombstone> tombstones)
    {
        var tombstoneRepo = new Mock<IRepository<SyncTombstone>>();
        tombstoneRepo
            .Setup(r => r.GetAllAsync(It.IsAny<Expression<Func<SyncTombstone, bool>>>(), It.IsAny<CancellationToken>()))
            .Returns((Expression<Func<SyncTombstone, bool>> filter, CancellationToken _) =>
                Task.FromResult(tombstones.Where(filter.Compile()).ToList()));

        var storyRepo = new Mock<IOrganizationOwnedRepository<Story>>();
        storyRepo
            .Setup(r => r.GetByIdForOrganizationAsync(StoryId, OrganizationId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(story);

        return new GetSyncTombstonesHandler(tombstoneRepo.Object, storyRepo.Object);
    }

    private static SyncTombstone Tombstone(Guid ownerUserId) => new()
    {
        Id = Guid.NewGuid(),
        StoryId = StoryId,
        RowId = StoryId,
        Table = "projects",
        UserId = ownerUserId,
        OrganizationId = OrganizationId,
        DeletedAt = DateTime.UtcNow,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };
}
