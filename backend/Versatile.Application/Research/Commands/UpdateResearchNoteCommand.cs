using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Research.Commands;

public record UpdateResearchNoteCommand(Guid Id, string? Title, string? Content, Guid? OrganizationId, Guid UserId) : IRequest<ResearchDto>, IRequiresOrganization;
