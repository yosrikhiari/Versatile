using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.VolumeEntities.Commands;

public record DeleteVolumeEntityCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
