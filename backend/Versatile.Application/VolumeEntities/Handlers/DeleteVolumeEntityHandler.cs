using MediatR;
using Versatile.Application.VolumeEntities.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.VolumeEntities.Handlers;

public class DeleteVolumeEntityHandler : IRequestHandler<DeleteVolumeEntityCommand, Unit>
{
    private readonly IRepository<VolumeEntity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteVolumeEntityHandler(IRepository<VolumeEntity> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    {
        _entities = entities;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteVolumeEntityCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("VolumeEntity not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("VolumeEntity not found");

        _entities.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
