using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GeneratedStories.Queries;

public record GetGeneratedStoriesQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<GeneratedStoryDto>>, IRequiresOrganization;

public record GetGeneratedStoryByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<GeneratedStoryDto>, IRequiresOrganization;
