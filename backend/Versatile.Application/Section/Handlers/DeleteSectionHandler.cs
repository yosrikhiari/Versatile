using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Section.Commands;
using Entity = Versatile.Domain.Entities.Section;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Section.Handlers;

public class DeleteSectionHandler : IRequestHandler<DeleteSectionCommand, Unit>
{
    private readonly DbContext _db;
    public DeleteSectionHandler(DbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteSectionCommand request, CancellationToken ct)
    {
        var section = await _db.Set<Entity>()
            .Include(s => s.Story)
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.Story!.UserId == request.UserId, ct)
            ?? throw new KeyNotFoundException("Section not found");
        _db.Set<Entity>().Remove(section);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
