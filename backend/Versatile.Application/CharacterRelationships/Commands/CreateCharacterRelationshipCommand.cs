using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.CharacterRelationships.Commands;
public record CreateCharacterRelationshipCommand(Guid StoryId, Guid FromCharacterId, Guid ToCharacterId, string RelationshipType, string? Notes, Guid? OrganizationId, Guid UserId) : IRequest<CharacterRelationshipDto>, IRequiresOrganization;
