using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Snapshots.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snapshots.Handlers;

public class UpdateSnapshotHandler : IRequestHandler<UpdateSnapshotCommand, SnapshotDto>
{
    private readonly IRepository<Snapshot> _snapshots;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSnapshotHandler(
        IRepository<Snapshot> snapshots,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _snapshots = snapshots;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<SnapshotDto> Handle(UpdateSnapshotCommand request, CancellationToken ct)
    {
        var snapshot = await _snapshots.GetByIdAsync(request.Id, ct);
        if (snapshot is null)
            throw new KeyNotFoundException("Snapshot not found");

        var story = await _stories.GetByIdForOrganizationAsync(snapshot.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Snapshot not found");

        if (request.ChapterId is not null) snapshot.ChapterId = request.ChapterId;
        if (request.Label is not null) snapshot.Label = request.Label;
        if (request.Data is not null) snapshot.Data = request.Data;
        snapshot.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(snapshot);
    }

    private static SnapshotDto ToDto(Snapshot s) => new(
        s.Id, s.StoryId, s.ChapterId, s.Timestamp, s.Label, s.Data
    );
}
