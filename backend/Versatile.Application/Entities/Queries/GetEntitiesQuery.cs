using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.Entities.Queries;
public record GetEntitiesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<EntityDto>>, IRequiresOrganization;
public record GetEntityByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<EntityDto>, IRequiresOrganization;
