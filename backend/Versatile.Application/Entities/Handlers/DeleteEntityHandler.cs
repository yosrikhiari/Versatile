using MediatR;
using Versatile.Application.Entities.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using Entity = Versatile.Domain.Entities.Entity;
namespace Versatile.Application.Entities.Handlers;
public class DeleteEntityHandler : IRequestHandler<DeleteEntityCommand, Unit>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;
    public DeleteEntityHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    { _entities = entities; _stories = stories; _unitOfWork = unitOfWork; }
    public async Task<Unit> Handle(DeleteEntityCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("Entity not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Entity not found");
        _entities.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
