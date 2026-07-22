using MediatR;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Queries;

public record GetStoriesQuery(Guid? OrganizationId, Guid UserId, int Page = 1, int PageSize = 20) : IPagedQuery<StoryDto>, IRequiresOrganization;

public record GetStoryByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<StoryDto>, IRequiresOrganization;
