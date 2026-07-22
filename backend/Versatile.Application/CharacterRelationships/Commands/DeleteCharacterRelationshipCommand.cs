using MediatR;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.CharacterRelationships.Commands;
public record DeleteCharacterRelationshipCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
