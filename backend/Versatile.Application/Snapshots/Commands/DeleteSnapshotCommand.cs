using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snapshots.Commands;

public record DeleteSnapshotCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
