using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryElements.Commands;

public record DeleteStoryElementCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
