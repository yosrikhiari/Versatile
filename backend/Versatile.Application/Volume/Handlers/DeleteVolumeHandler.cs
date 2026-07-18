using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Volume.Commands;
using Entity = Versatile.Domain.Entities.Volume;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Volume.Handlers;

public class DeleteVolumeHandler : IRequestHandler<DeleteVolumeCommand, Unit>
{
    private readonly DbContext _db;
    public DeleteVolumeHandler(DbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteVolumeCommand request, CancellationToken ct)
    {
        var volume = await _db.Set<Entity>()
            .Include(v => v.Story)
            .FirstOrDefaultAsync(v => v.Id == request.Id && v.Story!.UserId == request.UserId && v.Story!.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Volume not found");
        _db.Set<Entity>().Remove(volume);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
