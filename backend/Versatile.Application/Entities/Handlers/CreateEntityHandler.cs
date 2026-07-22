using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Entities.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Entity = Versatile.Domain.Entities.Entity;
namespace Versatile.Application.Entities.Handlers;
public class CreateEntityHandler : IRequestHandler<CreateEntityCommand, EntityDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Entity> _entities;
    private readonly IUnitOfWork _unitOfWork;
    public CreateEntityHandler(IOrganizationOwnedRepository<Story> stories, IRepository<Entity> entities, IUnitOfWork unitOfWork)
    { _stories = stories; _entities = entities; _unitOfWork = unitOfWork; }
    public async Task<EntityDto> Handle(CreateEntityCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var entity = new Entity { StoryId = request.StoryId, Name = request.Name, Type = request.Type, Description = request.Description, Metadata = request.Metadata, UserId = request.UserId, OrganizationId = request.OrganizationId };
        await _entities.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static EntityDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Name, e.Type, e.Description, e.Metadata, e.CreatedAt, e.UpdatedAt);
}
