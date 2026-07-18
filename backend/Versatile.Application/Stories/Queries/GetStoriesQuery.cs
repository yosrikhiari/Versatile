using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Queries;

public record GetStoriesQuery(Guid? OrganizationId, Guid UserId) : IRequest<List<StoryDto>>, IRequiresOrganization;

public record GetStoryByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<StoryDto>, IRequiresOrganization;
