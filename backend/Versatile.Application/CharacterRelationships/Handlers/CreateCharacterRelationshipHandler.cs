using MediatR;
using Versatile.Application.CharacterRelationships.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.CharacterRelationships.Handlers;
public class CreateCharacterRelationshipHandler : IRequestHandler<CreateCharacterRelationshipCommand, CharacterRelationshipDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<CharacterRelationship> _entities;
    private readonly IUnitOfWork _unitOfWork;
    public CreateCharacterRelationshipHandler(IOrganizationOwnedRepository<Story> stories, IRepository<CharacterRelationship> entities, IUnitOfWork unitOfWork)
    { _stories = stories; _entities = entities; _unitOfWork = unitOfWork; }
    public async Task<CharacterRelationshipDto> Handle(CreateCharacterRelationshipCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var entity = new CharacterRelationship { StoryId = request.StoryId, FromCharacterId = request.FromCharacterId, ToCharacterId = request.ToCharacterId, RelationshipType = request.RelationshipType, Notes = request.Notes, UserId = request.UserId, OrganizationId = request.OrganizationId };
        await _entities.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static CharacterRelationshipDto ToDto(CharacterRelationship e) => new(e.Id, e.StoryId, e.FromCharacterId, e.ToCharacterId, e.RelationshipType, e.Notes, e.CreatedAt);
}
