using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryElements.Queries;

public record GetStoryElementsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<StoryElementDto>>, IRequiresOrganization;

public record GetStoryElementByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<StoryElementDto>, IRequiresOrganization;
