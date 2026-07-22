using MediatR;
using Versatile.Application.CharacterRelationships.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.CharacterRelationships.Handlers;
public class DeleteCharacterRelationshipHandler : IRequestHandler<DeleteCharacterRelationshipCommand, Unit>
{
    private readonly IRepository<CharacterRelationship> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;
    public DeleteCharacterRelationshipHandler(IRepository<CharacterRelationship> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    { _entities = entities; _stories = stories; _unitOfWork = unitOfWork; }
    public async Task<Unit> Handle(DeleteCharacterRelationshipCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("CharacterRelationship not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("CharacterRelationship not found");
        _entities.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
