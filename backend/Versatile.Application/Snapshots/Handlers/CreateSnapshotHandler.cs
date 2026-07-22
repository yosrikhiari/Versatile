using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Snapshots.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snapshots.Handlers;

public class CreateSnapshotHandler : IRequestHandler<CreateSnapshotCommand, SnapshotDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Snapshot> _snapshots;
    private readonly IUnitOfWork _unitOfWork;

    public CreateSnapshotHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<Snapshot> snapshots,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _snapshots = snapshots;
        _unitOfWork = unitOfWork;
    }

    public async Task<SnapshotDto> Handle(CreateSnapshotCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var snapshot = new Snapshot
        {
            StoryId = request.StoryId,
            ChapterId = request.ChapterId,
            Timestamp = request.Timestamp,
            Label = request.Label,
            Data = request.Data,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _snapshots.AddAsync(snapshot, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(snapshot);
    }

    private static SnapshotDto ToDto(Snapshot s) => new(
        s.Id, s.StoryId, s.ChapterId, s.Timestamp, s.Label, s.Data
    );
}
