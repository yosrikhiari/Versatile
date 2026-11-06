using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Sync.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Sync.Handlers;

public class GetSyncTombstonesHandler : IRequestHandler<GetSyncTombstonesQuery, List<SyncTombstoneDto>>
{
    private readonly IRepository<SyncTombstone> _tombstoneRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;

    public GetSyncTombstonesHandler(
        IRepository<SyncTombstone> tombstoneRepo,
        IOrganizationOwnedRepository<Story> storyRepo)
    {
        _tombstoneRepo = tombstoneRepo;
        _storyRepo = storyRepo;
    }

    public async Task<List<SyncTombstoneDto>> Handle(GetSyncTombstonesQuery request, CancellationToken ct)
    {
        var organizationId = request.OrganizationId!.Value;
        var story = await _storyRepo.GetByIdForOrganizationAsync(request.StoryId, organizationId, ct);
        if (story is not null && story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var tombstones = await _tombstoneRepo.GetAllAsync(
            t => t.StoryId == request.StoryId && t.OrganizationId == organizationId, ct);

        if (story is null)
        {
            // The story row is gone (root deletion) but its tombstones remain.
            // Authorize from tombstone ownership: current records carry the row's
            // UserId; legacy interceptor rows used Guid.Empty, so accept ownerless
            // tombstones only within the same organization context.
            if (tombstones.Count == 0 ||
                !tombstones.Any(t => t.UserId == request.UserId || t.UserId == Guid.Empty))
                throw new KeyNotFoundException("Story not found");
        }

        return tombstones
            .OrderBy(t => t.DeletedAt)
            .Select(t => new SyncTombstoneDto(t.StoryId, t.Table, t.RowId, t.DeletedAt))
            .ToList();
    }
}
