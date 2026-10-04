using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Branches.Commands;

public record DeleteBranchCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
