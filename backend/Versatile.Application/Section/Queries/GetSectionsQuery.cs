using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Section.Queries;

public record GetSectionsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<SectionDto>>, IRequiresOrganization;
public record GetSectionByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<SectionDto>, IRequiresOrganization;
