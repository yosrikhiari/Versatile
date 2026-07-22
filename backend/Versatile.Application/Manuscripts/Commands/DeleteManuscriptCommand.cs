using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Manuscripts.Commands;

public record DeleteManuscriptCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
