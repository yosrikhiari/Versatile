using MediatR;
using Versatile.Application.CharacterRelationships.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.CharacterRelationships.Handlers;
public class UpdateCharacterRelationshipHandler : IRequestHandler<UpdateCharacterRelationshipCommand, CharacterRelationshipDto>
{
    private readonly IRepository<CharacterRelationship> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;
    public UpdateCharacterRelationshipHandler(IRepository<CharacterRelationship> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    { _entities = entities; _stories = stories; _unitOfWork = unitOfWork; }
    public async Task<CharacterRelationshipDto> Handle(UpdateCharacterRelationshipCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("CharacterRelationship not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("CharacterRelationship not found");
        if (request.FromCharacterId.HasValue) entity.FromCharacterId = request.FromCharacterId.Value;
        if (request.ToCharacterId.HasValue) entity.ToCharacterId = request.ToCharacterId.Value;
        if (request.RelationshipType is not null) entity.RelationshipType = request.RelationshipType;
        if (request.Notes is not null) entity.Notes = request.Notes;
        entity.UpdatedAt = DateTime.UtcNow;
        _entities.Update(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }
    private static CharacterRelationshipDto ToDto(CharacterRelationship e) => new(e.Id, e.StoryId, e.FromCharacterId, e.ToCharacterId, e.RelationshipType, e.Notes, e.CreatedAt);
}
