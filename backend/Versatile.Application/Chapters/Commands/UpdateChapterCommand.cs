using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Chapters.Commands;

public record UpdateChapterCommand(Guid Id, string? Title, int? Order, string? Status, string? ArcAssignment, Guid UserId) : IRequest<ChapterDto>;
