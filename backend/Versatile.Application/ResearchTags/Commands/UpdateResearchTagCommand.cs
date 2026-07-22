using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.ResearchTags.Commands;

public record UpdateResearchTagCommand(Guid Id, string? Name, string? Color, Guid UserId) : IRequest<ResearchTagDto>;
