using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Volume.Commands;

public record DeleteVolumeCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
