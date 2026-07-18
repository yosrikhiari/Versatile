using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Subsection.Commands;
using Entity = Versatile.Domain.Entities.Subsection;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Subsection.Handlers;

public class DeleteSubsectionHandler : IRequestHandler<DeleteSubsectionCommand, Unit>
{
    private readonly DbContext _db;
    public DeleteSubsectionHandler(DbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteSubsectionCommand request, CancellationToken ct)
    {
        var subsection = await _db.Set<Entity>()
            .Include(s => s.Story)
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.Story!.UserId == request.UserId, ct)
            ?? throw new KeyNotFoundException("Subsection not found");
        _db.Set<Entity>().Remove(subsection);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
