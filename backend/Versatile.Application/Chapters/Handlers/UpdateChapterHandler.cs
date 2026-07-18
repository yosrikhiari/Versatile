using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Chapters.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Chapters.Handlers;

public class UpdateChapterHandler : IRequestHandler<UpdateChapterCommand, ChapterDto>
{
    private readonly DbContext _db;

    public UpdateChapterHandler(DbContext db) => _db = db;

    public async Task<ChapterDto> Handle(UpdateChapterCommand request, CancellationToken ct)
    {
        var chapter = await _db.Set<Chapter>()
            .Include(c => c.Story)
            .FirstOrDefaultAsync(c => c.Id == request.Id && c.Story!.UserId == request.UserId && c.Story!.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Chapter not found");

        if (request.Title is not null) chapter.Title = request.Title;
        if (request.Order.HasValue) chapter.Order = request.Order.Value;
        if (request.Status is not null) chapter.Status = request.Status;
        if (request.ArcAssignment is not null) chapter.ArcAssignment = request.ArcAssignment;
        chapter.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return new ChapterDto(chapter.Id, chapter.StoryId, chapter.Title, chapter.Order, chapter.Status, chapter.ArcAssignment, chapter.CreatedAt, chapter.UpdatedAt);
    }
}
