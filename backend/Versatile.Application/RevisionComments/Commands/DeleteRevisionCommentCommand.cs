using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.RevisionComments.Commands;

public record DeleteRevisionCommentCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
