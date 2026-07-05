using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Stories.Commands;

public record CreateStoryCommand(string Title, string? Premise, string? Genre, string? Tone, string? WritingStyle, string? TargetAudience, Guid UserId) : IRequest<StoryDto>;
