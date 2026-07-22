using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SessionArchiveItems.Commands;

public record DeleteSessionArchiveItemCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
