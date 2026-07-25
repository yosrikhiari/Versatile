using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchTags.Queries;

public record GetResearchTagsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<ResearchTagDto>>, IRequiresOrganization;

public record GetResearchTagByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<ResearchTagDto>, IRequiresOrganization;
