using MediatR;
using Versatile.Application.Chapters.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Chapters.Handlers;

public class GetChaptersHandler : IRequestHandler<GetChaptersQuery, List<ChapterDto>>
{
    private readonly IRepository<Story> _stories;
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;

    public GetChaptersHandler(
        IRepository<Story> stories,
        IOrganizationOwnedRepository<Chapter> chapters)
    {
        _stories = stories;
        _chapters = chapters;
    }

    public async Task<List<ChapterDto>> Handle(GetChaptersQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdAsync(request.StoryId, ct);
        if (story is null || story.UserId != request.UserId || story.OrganizationId != request.OrganizationId)
            throw new KeyNotFoundException("Story not found");

        var chapters = await _chapters.GetAllAsync(c => c.StoryId == request.StoryId, ct);
        return chapters
            .OrderBy(c => c.Order)
            .Select(c => new ChapterDto(c.Id, c.StoryId, c.Title, c.Order, c.Status, c.ArcAssignment, c.CreatedAt, c.UpdatedAt))
            .ToList();
    }
}

public class GetChapterByIdHandler : IRequestHandler<GetChapterByIdQuery, ChapterDto>
{
    private readonly IOrganizationOwnedRepository<Chapter> _chapters;

    public GetChapterByIdHandler(IOrganizationOwnedRepository<Chapter> chapters) => _chapters = chapters;

    public async Task<ChapterDto> Handle(GetChapterByIdQuery request, CancellationToken ct)
    {
        var chapter = await _chapters.GetByIdForOrganizationAsync(request.Id, request.OrganizationId.Value, ct);
        if (chapter is null || chapter.UserId != request.UserId)
            throw new KeyNotFoundException("Chapter not found");

        return new ChapterDto(chapter.Id, chapter.StoryId, chapter.Title, chapter.Order, chapter.Status, chapter.ArcAssignment, chapter.CreatedAt, chapter.UpdatedAt);
    }
}
