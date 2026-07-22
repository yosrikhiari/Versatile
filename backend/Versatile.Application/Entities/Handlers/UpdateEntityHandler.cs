using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Entities.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Entity = Versatile.Domain.Entities.Entity;
namespace Versatile.Application.Entities.Handlers;
public class UpdateEntityHandler : IRequestHandler<UpdateEntityCommand, EntityDto>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;
    public UpdateEntityHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    { _entities = entities; _stories = stories; _unitOfWork = unitOfWork; }
    public async Task<EntityDto> Handle(UpdateEntityCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("Entity not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Entity not found");
        if (request.Name is not null) entity.Name = request.Name;
        if (request.Type is not null) entity.Type = request.Type;
        if (request.Description is not null) entity.Description = request.Description;
        if (request.Metadata is not null) entity.Metadata = request.Metadata;
        entity.UpdatedAt = DateTime.UtcNow;
        _entities.Update(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static EntityDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Name, e.Type, e.Description, e.Metadata, e.CreatedAt, e.UpdatedAt);
}
