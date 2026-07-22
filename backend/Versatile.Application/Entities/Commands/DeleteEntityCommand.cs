using MediatR;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.Entities.Commands;
public record DeleteEntityCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
