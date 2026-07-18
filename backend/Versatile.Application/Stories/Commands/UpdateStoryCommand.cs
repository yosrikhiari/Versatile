using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Commands;

public record UpdateStoryCommand(Guid Id, string? Title, string? Premise, string? Genre, string? Tone, string? WritingStyle, string? TargetAudience, Guid? OrganizationId, Guid UserId) : IRequest<StoryDto>, IRequiresOrganization;
