using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphGroups.Queries;

public record GetGraphGroupsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<GraphGroupDto>>, IRequiresOrganization;

public record GetGraphGroupByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<GraphGroupDto>, IRequiresOrganization;
