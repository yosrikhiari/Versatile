using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Scenes.Commands;

public record DeleteSceneCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
