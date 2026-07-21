using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snippets.Queries;

public record GetSnippetsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<SnippetDto>>, IRequiresOrganization;

public record GetSnippetByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<SnippetDto>, IRequiresOrganization;
