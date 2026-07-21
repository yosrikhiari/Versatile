using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Annotations.Commands;

public record DeleteAnnotationCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
