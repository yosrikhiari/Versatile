using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.NodePositions.Commands;

public record DeleteNodePositionCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
