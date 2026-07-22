using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.ResearchTags.Commands;

public record CreateResearchTagCommand(string Name, Guid StoryId, string? Color, Guid UserId) : IRequest<ResearchTagDto>;
