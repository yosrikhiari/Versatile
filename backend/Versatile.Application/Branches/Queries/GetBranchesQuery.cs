using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Branches.Queries;

public record GetBranchesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<BranchDto>>, IRequiresOrganization;

public record GetBranchByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<BranchDto>, IRequiresOrganization;
