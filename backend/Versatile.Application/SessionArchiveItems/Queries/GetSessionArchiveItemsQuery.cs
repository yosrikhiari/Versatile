using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SessionArchiveItems.Queries;

public record GetSessionArchiveItemsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<SessionArchiveItemDto>>, IRequiresOrganization;

public record GetSessionArchiveItemByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<SessionArchiveItemDto>, IRequiresOrganization;
