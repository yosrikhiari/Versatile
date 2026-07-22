using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.VolumeEntities.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using DomainVolume = Versatile.Domain.Entities.Volume;

namespace Versatile.Application.VolumeEntities.Handlers;

public class UpdateVolumeEntityHandler : IRequestHandler<UpdateVolumeEntityCommand, VolumeEntityDto>
{
    private readonly IRepository<VolumeEntity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IOrganizationOwnedRepository<DomainVolume> _volumes;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateVolumeEntityHandler(IRepository<VolumeEntity> entities, IOrganizationOwnedRepository<Story> stories, IOrganizationOwnedRepository<DomainVolume> volumes, IUnitOfWork unitOfWork)
    {
        _entities = entities;
        _stories = stories;
        _volumes = volumes;
        _unitOfWork = unitOfWork;
    }

    public async Task<VolumeEntityDto> Handle(UpdateVolumeEntityCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("VolumeEntity not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("VolumeEntity not found");

        if (request.VolumeId.HasValue)
        {
            var volume = await _volumes.GetByIdForOrganizationAsync(request.VolumeId.Value, request.OrganizationId!.Value, ct);
            if (volume is null || volume.StoryId != entity.StoryId)
                throw new KeyNotFoundException("Volume not found");
            entity.VolumeId = request.VolumeId.Value;
        }
        if (request.EntityType is not null) entity.EntityType = request.EntityType;
        if (request.EntityId is not null) entity.EntityId = request.EntityId;
        if (request.IsPrimary.HasValue) entity.IsPrimary = request.IsPrimary.Value;
        entity.UpdatedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }

    private static VolumeEntityDto ToDto(VolumeEntity e) => new(e.Id, e.StoryId, e.VolumeId, e.EntityType, e.EntityId, e.IsPrimary);
}
