using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.VolumeEntities.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using DomainVolume = Versatile.Domain.Entities.Volume;

namespace Versatile.Application.VolumeEntities.Handlers;

public class CreateVolumeEntityHandler : IRequestHandler<CreateVolumeEntityCommand, VolumeEntityDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IOrganizationOwnedRepository<DomainVolume> _volumes;
    private readonly IRepository<VolumeEntity> _entities;
    private readonly IUnitOfWork _unitOfWork;

    public CreateVolumeEntityHandler(IOrganizationOwnedRepository<Story> stories, IOrganizationOwnedRepository<DomainVolume> volumes, IRepository<VolumeEntity> entities, IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _volumes = volumes;
        _entities = entities;
        _unitOfWork = unitOfWork;
    }

    public async Task<VolumeEntityDto> Handle(CreateVolumeEntityCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var volume = await _volumes.GetByIdForOrganizationAsync(request.VolumeId, request.OrganizationId!.Value, ct);
        if (volume is null || volume.StoryId != request.StoryId)
            throw new KeyNotFoundException("Volume not found");

        var entity = new VolumeEntity
        {
            StoryId = request.StoryId,
            VolumeId = request.VolumeId,
            EntityType = request.EntityType,
            EntityId = request.EntityId,
            IsPrimary = request.IsPrimary,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _entities.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }

    private static VolumeEntityDto ToDto(VolumeEntity e) => new(e.Id, e.StoryId, e.VolumeId, e.EntityType, e.EntityId, e.IsPrimary);
}
