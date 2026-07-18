using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Section.Commands;

public record DeleteSectionCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
