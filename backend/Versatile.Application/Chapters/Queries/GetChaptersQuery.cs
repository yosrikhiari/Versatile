using MediatR;
using Versatile.Application.DTOs;

namespace Versatile.Application.Chapters.Queries;

public record GetChaptersQuery(Guid StoryId, Guid UserId) : IRequest<List<ChapterDto>>;

public record GetChapterByIdQuery(Guid Id, Guid UserId) : IRequest<ChapterDto>;
