using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.RevisionComments.Queries;

public record GetRevisionCommentsQuery(Guid StoryId, Guid? OrganizationId, Guid UserId) : IRequest<List<RevisionCommentDto>>, IRequiresOrganization;

public record GetRevisionCommentByIdQuery(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<RevisionCommentDto>, IRequiresOrganization;
