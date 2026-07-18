using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Subsection.Commands;

public record DeleteSubsectionCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
