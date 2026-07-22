using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.NodePositions.Queries;

public record GetNodePositionsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<NodePositionDto>>, IRequiresOrganization;

public record GetNodePositionByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<NodePositionDto>, IRequiresOrganization;
