using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Chapters.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Chapters.Handlers;

public class CreateChapterHandler : IRequestHandler<CreateChapterCommand, ChapterDto>
{
    private readonly DbContext _db;

    public CreateChapterHandler(DbContext db) => _db = db;

    public async Task<ChapterDto> Handle(CreateChapterCommand request, CancellationToken ct)
    {
        if (!await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct))
            throw new KeyNotFoundException("Story not found");

        var maxOrder = await _db.Set<Chapter>()
            .Where(c => c.StoryId == request.StoryId)
            .MaxAsync(c => (int?)c.Order, ct) ?? 0;

        var chapter = new Chapter
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Order = request.Order > 0 ? request.Order : maxOrder + 1,
            ArcAssignment = request.ArcAssignment
        };

        _db.Set<Chapter>().Add(chapter);
        await _db.SaveChangesAsync(ct);

        return new ChapterDto(chapter.Id, chapter.StoryId, chapter.Title, chapter.Order, chapter.Status, chapter.ArcAssignment, chapter.CreatedAt, chapter.UpdatedAt);
    }
}
