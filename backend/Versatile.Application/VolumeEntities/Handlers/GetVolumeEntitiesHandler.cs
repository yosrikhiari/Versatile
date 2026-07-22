using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.VolumeEntities.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.VolumeEntities.Handlers;

public class GetVolumeEntitiesHandler : IRequestHandler<GetVolumeEntitiesQuery, List<VolumeEntityDto>>
{
    private readonly IRepository<VolumeEntity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetVolumeEntitiesHandler(IRepository<VolumeEntity> entities, IOrganizationOwnedRepository<Story> stories)
    {
        _entities = entities;
        _stories = stories;
    }

    public async Task<List<VolumeEntityDto>> Handle(GetVolumeEntitiesQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entities = await _entities.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return entities.Select(ToDto).ToList();
    }

    private static VolumeEntityDto ToDto(VolumeEntity e) => new(e.Id, e.StoryId, e.VolumeId, e.EntityType, e.EntityId, e.IsPrimary);
}

public class GetVolumeEntityByIdHandler : IRequestHandler<GetVolumeEntityByIdQuery, VolumeEntityDto>
{
    private readonly IRepository<VolumeEntity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetVolumeEntityByIdHandler(IRepository<VolumeEntity> entities, IOrganizationOwnedRepository<Story> stories)
    {
        _entities = entities;
        _stories = stories;
    }

    public async Task<VolumeEntityDto> Handle(GetVolumeEntityByIdQuery request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("VolumeEntity not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("VolumeEntity not found");

        return ToDto(entity);
    }

    private static VolumeEntityDto ToDto(VolumeEntity e) => new(e.Id, e.StoryId, e.VolumeId, e.EntityType, e.EntityId, e.IsPrimary);
}
