using System.Linq.Expressions;
using MediatR;
using Versatile.Application.Chapters.Queries;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Chapters.Handlers;

public class GetChaptersHandler : IRequestHandler<GetChaptersQuery, PagedResponse<ChapterDto>>
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

    public async Task<PagedResponse<ChapterDto>> Handle(GetChaptersQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdAsync(request.StoryId, ct);
        if (story is null || story.UserId != request.UserId || story.OrganizationId != request.OrganizationId)
            throw new KeyNotFoundException("Story not found");

        Expression<Func<Chapter, bool>> filter = c => c.StoryId == request.StoryId;

        if (request.AfterId.HasValue || request.Page <= 1)
        {
            var (chapters, hasNextPage) = await _chapters.GetPagedKeysetAsync(filter, request.PageSize, request.AfterId,
                q => q.OrderBy(c => c.Order), ct);
            var items = chapters.Select(c => new ChapterDto(c.Id, c.StoryId, c.Title, c.Order, c.Status, c.ArcAssignment, c.CreatedAt, c.UpdatedAt)).ToList();
            var nextCursor = hasNextPage ? items.LastOrDefault()?.Id : null;

            if (request.AfterId.HasValue)
                return new PagedResponse<ChapterDto>(items, 0, 0, request.PageSize, nextCursor);

            // First page with keyset -- also compute total count for backward compatibility
            var keysetTotalCount = await _chapters.CountAsync(filter, ct);
            return new PagedResponse<ChapterDto>(items, keysetTotalCount, request.Page, request.PageSize, nextCursor);
        }

        var (chaptersPaged, totalCount) = await _chapters.GetPagedAsync(filter, request.Page, request.PageSize, q => q.OrderBy(c => c.Order), ct);
        var itemsPaged = chaptersPaged.Select(c => new ChapterDto(c.Id, c.StoryId, c.Title, c.Order, c.Status, c.ArcAssignment, c.CreatedAt, c.UpdatedAt)).ToList();
        return new PagedResponse<ChapterDto>(itemsPaged, totalCount, request.Page, request.PageSize);
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