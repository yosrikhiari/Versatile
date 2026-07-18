using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Chapters.Commands;

public record CreateChapterCommand(Guid StoryId, string Title, int Order, string? ArcAssignment, Guid UserId) : IRequest<ChapterDto>;
