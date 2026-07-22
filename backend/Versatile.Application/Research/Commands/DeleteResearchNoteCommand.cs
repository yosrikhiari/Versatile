using MediatR;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Research.Commands;

public record DeleteResearchNoteCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
