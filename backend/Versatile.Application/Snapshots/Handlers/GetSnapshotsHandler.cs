using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Snapshots.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snapshots.Handlers;

public class GetSnapshotsHandler : IRequestHandler<GetSnapshotsQuery, List<SnapshotDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Snapshot> _snapshots;

    public GetSnapshotsHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<Snapshot> snapshots)
    {
        _stories = stories;
        _snapshots = snapshots;
    }

    public async Task<List<SnapshotDto>> Handle(GetSnapshotsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var snapshots = await _snapshots.GetAllAsync(s => s.StoryId == request.StoryId, ct);
        return snapshots
            .OrderByDescending(s => s.Timestamp)
            .Select(s => new SnapshotDto(s.Id, s.StoryId, s.ChapterId, s.Timestamp, s.Label, s.Data))
            .ToList();
    }
}

public class GetSnapshotByIdHandler : IRequestHandler<GetSnapshotByIdQuery, SnapshotDto>
{
    private readonly IRepository<Snapshot> _snapshots;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetSnapshotByIdHandler(
        IRepository<Snapshot> snapshots,
        IOrganizationOwnedRepository<Story> stories)
    {
        _snapshots = snapshots;
        _stories = stories;
    }

    public async Task<SnapshotDto> Handle(GetSnapshotByIdQuery request, CancellationToken ct)
    {
        var snapshot = await _snapshots.GetByIdAsync(request.Id, ct);
        if (snapshot is null)
            throw new KeyNotFoundException("Snapshot not found");

        var story = await _stories.GetByIdForOrganizationAsync(snapshot.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Snapshot not found");

        return new SnapshotDto(snapshot.Id, snapshot.StoryId, snapshot.ChapterId, snapshot.Timestamp, snapshot.Label, snapshot.Data);
    }
}
