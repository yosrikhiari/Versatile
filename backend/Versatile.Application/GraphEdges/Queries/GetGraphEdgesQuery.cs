using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphEdges.Queries;

public record GetGraphEdgesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<GraphEdgeDto>>, IRequiresOrganization;

public record GetGraphEdgeByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<GraphEdgeDto>, IRequiresOrganization;
