using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Volume.Commands;

public record CreateVolumeCommand(Guid StoryId, string Title, string? Description, string? Color, int? SortOrder, string? ChapterIds, Guid UserId) : IRequest<VolumeDto>;
