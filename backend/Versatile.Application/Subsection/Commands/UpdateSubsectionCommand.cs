using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Subsection.Commands;

public record UpdateSubsectionCommand(Guid Id, string? Title, string? Summary, string? Content, int? Order, string? Tags, Guid? OrganizationId, Guid UserId) : IRequest<SubsectionDto>, IRequiresOrganization;
