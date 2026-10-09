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
        var story = await _storyRepo.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var tombstones = await _tombstoneRepo.GetAllAsync(t => t.StoryId == request.StoryId, ct);
        return tombstones
            .OrderBy(t => t.DeletedAt)
            .Select(t => new SyncTombstoneDto(t.StoryId, t.Table, t.RowId, t.DeletedAt))
            .ToList();
    }
}
