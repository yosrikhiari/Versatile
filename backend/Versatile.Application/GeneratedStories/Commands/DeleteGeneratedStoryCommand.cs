using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GeneratedStories.Commands;

public record DeleteGeneratedStoryCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
