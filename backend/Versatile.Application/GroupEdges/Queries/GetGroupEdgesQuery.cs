using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GroupEdges.Queries;

public record GetGroupEdgesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<GroupEdgeDto>>, IRequiresOrganization;

public record GetGroupEdgeByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<GroupEdgeDto>, IRequiresOrganization;
