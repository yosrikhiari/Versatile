using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.CharacterRelationships.Queries;
public record GetCharacterRelationshipsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<CharacterRelationshipDto>>, IRequiresOrganization;
public record GetCharacterRelationshipByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<CharacterRelationshipDto>, IRequiresOrganization;
