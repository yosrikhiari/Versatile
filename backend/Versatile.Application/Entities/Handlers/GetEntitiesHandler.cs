using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Entities.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Entity = Versatile.Domain.Entities.Entity;
namespace Versatile.Application.Entities.Handlers;
public class GetEntitiesHandler : IRequestHandler<GetEntitiesQuery, List<EntityDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Entity> _entities;
    public GetEntitiesHandler(IOrganizationOwnedRepository<Story> stories, IRepository<Entity> entities) { _stories = stories; _entities = entities; }
    public async Task<List<EntityDto>> Handle(GetEntitiesQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var items = await _entities.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return items.Select(e => ToDto(e)).ToList();
    }
    private static EntityDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Name, e.Type, e.Description, e.Metadata, e.CreatedAt, e.UpdatedAt);
}
public class GetEntityByIdHandler : IRequestHandler<GetEntityByIdQuery, EntityDto>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    public GetEntityByIdHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories) { _entities = entities; _stories = stories; }
    public async Task<EntityDto> Handle(GetEntityByIdQuery request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("Entity not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Entity not found");
        return ToDto(entity);
    }
    private static EntityDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Name, e.Type, e.Description, e.Metadata, e.CreatedAt, e.UpdatedAt);
}
