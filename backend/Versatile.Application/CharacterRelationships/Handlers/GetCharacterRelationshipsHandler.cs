using MediatR;
using Versatile.Application.CharacterRelationships.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.CharacterRelationships.Handlers;
public class GetCharacterRelationshipsHandler : IRequestHandler<GetCharacterRelationshipsQuery, List<CharacterRelationshipDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<CharacterRelationship> _entities;
    public GetCharacterRelationshipsHandler(IOrganizationOwnedRepository<Story> stories, IRepository<CharacterRelationship> entities) { _stories = stories; _entities = entities; }
    public async Task<List<CharacterRelationshipDto>> Handle(GetCharacterRelationshipsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("Story not found");
        var items = await _entities.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return items.Select(e => ToDto(e)).ToList();
    }
    private static CharacterRelationshipDto ToDto(CharacterRelationship e) => new(e.Id, e.StoryId, e.FromCharacterId, e.ToCharacterId, e.RelationshipType, e.Notes, e.CreatedAt);
}
public class GetCharacterRelationshipByIdHandler : IRequestHandler<GetCharacterRelationshipByIdQuery, CharacterRelationshipDto>
{
    private readonly IRepository<CharacterRelationship> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    public GetCharacterRelationshipByIdHandler(IRepository<CharacterRelationship> entities, IOrganizationOwnedRepository<Story> stories) { _entities = entities; _stories = stories; }
    public async Task<CharacterRelationshipDto> Handle(GetCharacterRelationshipByIdQuery request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null) throw new KeyNotFoundException("CharacterRelationship not found");
        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId) throw new KeyNotFoundException("CharacterRelationship not found");
        return ToDto(entity);
    }
    private static CharacterRelationshipDto ToDto(CharacterRelationship e) => new(e.Id, e.StoryId, e.FromCharacterId, e.ToCharacterId, e.RelationshipType, e.Notes, e.CreatedAt);
}
