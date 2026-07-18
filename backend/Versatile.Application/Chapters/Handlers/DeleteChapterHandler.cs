using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Chapters.Commands;
using Versatile.Domain.Entities;

namespace Versatile.Application.Chapters.Handlers;

public class DeleteChapterHandler : IRequestHandler<DeleteChapterCommand, Unit>
{
    private readonly DbContext _db;

    public DeleteChapterHandler(DbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteChapterCommand request, CancellationToken ct)
    {
        var chapter = await _db.Set<Chapter>()
            .Include(c => c.Story)
            .FirstOrDefaultAsync(c => c.Id == request.Id && c.Story!.UserId == request.UserId && c.Story!.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Chapter not found");

        _db.Set<Chapter>().Remove(chapter);
        await _db.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
