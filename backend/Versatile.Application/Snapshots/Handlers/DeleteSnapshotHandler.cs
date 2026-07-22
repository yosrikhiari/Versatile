using MediatR;
using Versatile.Application.Snapshots.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snapshots.Handlers;

public class DeleteSnapshotHandler : IRequestHandler<DeleteSnapshotCommand, Unit>
{
    private readonly IRepository<Snapshot> _snapshots;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSnapshotHandler(
        IRepository<Snapshot> snapshots,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _snapshots = snapshots;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteSnapshotCommand request, CancellationToken ct)
    {
        var snapshot = await _snapshots.GetByIdAsync(request.Id, ct);
        if (snapshot is null)
            throw new KeyNotFoundException("Snapshot not found");

        var story = await _stories.GetByIdForOrganizationAsync(snapshot.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Snapshot not found");

        _snapshots.Delete(snapshot);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
