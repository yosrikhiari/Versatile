using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snippets.Commands;

public record DeleteSnippetCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
