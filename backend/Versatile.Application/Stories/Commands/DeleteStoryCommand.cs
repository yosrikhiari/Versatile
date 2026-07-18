using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Commands;

public record DeleteStoryCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
