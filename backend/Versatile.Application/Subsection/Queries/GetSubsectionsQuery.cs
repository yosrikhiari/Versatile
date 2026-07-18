using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Subsection.Queries;

public record GetSubsectionsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<SubsectionDto>>, IRequiresOrganization;
public record GetSubsectionByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<SubsectionDto>, IRequiresOrganization;
