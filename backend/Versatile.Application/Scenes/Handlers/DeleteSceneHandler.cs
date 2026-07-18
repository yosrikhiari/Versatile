using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Scenes.Commands;
using Versatile.Domain.Entities;

namespace Versatile.Application.Scenes.Handlers;

public class DeleteSceneHandler : IRequestHandler<DeleteSceneCommand, Unit>
{
    private readonly DbContext _db;

    public DeleteSceneHandler(DbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteSceneCommand request, CancellationToken ct)
    {
        var scene = await _db.Set<Scene>()
            .Include(s => s.Chapter).ThenInclude(c => c!.Story)
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.Chapter!.Story!.UserId == request.UserId, ct)
            ?? throw new KeyNotFoundException("Scene not found");

        _db.Set<Scene>().Remove(scene);
        await _db.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
