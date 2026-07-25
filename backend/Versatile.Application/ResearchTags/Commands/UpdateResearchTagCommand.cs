using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchTags.Commands;

public record UpdateResearchTagCommand(Guid Id, string? Name, string? Color, Guid? OrganizationId, Guid UserId) : IRequest<ResearchTagDto>, IRequiresOrganization;
