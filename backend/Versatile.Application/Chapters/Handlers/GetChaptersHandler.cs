using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Chapters.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Chapters.Handlers;

public class GetChaptersHandler : IRequestHandler<GetChaptersQuery, List<ChapterDto>>
{
    private readonly DbContext _db;

    public GetChaptersHandler(DbContext db) => _db = db;

    public async Task<List<ChapterDto>> Handle(GetChaptersQuery request, CancellationToken ct)
    {
        if (!await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct))
            throw new KeyNotFoundException("Story not found");

        return await _db.Set<Chapter>()
            .Where(c => c.StoryId == request.StoryId)
            .OrderBy(c => c.Order)
            .Select(c => new ChapterDto(c.Id, c.StoryId, c.Title, c.Order, c.Status, c.ArcAssignment, c.CreatedAt, c.UpdatedAt))
            .ToListAsync(ct);
    }
}

public class GetChapterByIdHandler : IRequestHandler<GetChapterByIdQuery, ChapterDto>
{
    private readonly DbContext _db;

    public GetChapterByIdHandler(DbContext db) => _db = db;

    public async Task<ChapterDto> Handle(GetChapterByIdQuery request, CancellationToken ct)
    {
        var chapter = await _db.Set<Chapter>()
            .Include(c => c.Story)
            .FirstOrDefaultAsync(c => c.Id == request.Id && c.Story!.UserId == request.UserId && c.Story!.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Chapter not found");

        return new ChapterDto(chapter.Id, chapter.StoryId, chapter.Title, chapter.Order, chapter.Status, chapter.ArcAssignment, chapter.CreatedAt, chapter.UpdatedAt);
    }
}
