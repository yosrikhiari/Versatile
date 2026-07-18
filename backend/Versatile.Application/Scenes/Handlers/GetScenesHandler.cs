using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Queries;
using Versatile.Domain.Entities;

namespace Versatile.Application.Scenes.Handlers;

public class GetScenesHandler : IRequestHandler<GetScenesQuery, List<SceneDto>>
{
    private readonly DbContext _db;

    public GetScenesHandler(DbContext db) => _db = db;

    public async Task<List<SceneDto>> Handle(GetScenesQuery request, CancellationToken ct)
    {
        var chapter = await _db.Set<Chapter>()
            .Include(c => c.Story)
            .FirstOrDefaultAsync(c => c.Id == request.ChapterId && c.Story!.UserId == request.UserId, ct)
            ?? throw new KeyNotFoundException("Chapter not found");

        return await _db.Set<Scene>()
            .Where(s => s.ChapterId == request.ChapterId)
            .OrderBy(s => s.Order)
            .Select(s => new SceneDto(s.Id, s.ChapterId, s.Title, s.Content, s.Status, s.WordCount, s.Order, s.CreatedAt, s.UpdatedAt))
            .ToListAsync(ct);
    }
}

public class GetSceneByIdHandler : IRequestHandler<GetSceneByIdQuery, SceneDto>
{
    private readonly DbContext _db;

    public GetSceneByIdHandler(DbContext db) => _db = db;

    public async Task<SceneDto> Handle(GetSceneByIdQuery request, CancellationToken ct)
    {
        var scene = await _db.Set<Scene>()
            .Include(s => s.Chapter).ThenInclude(c => c!.Story)
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.Chapter!.Story!.UserId == request.UserId, ct)
            ?? throw new KeyNotFoundException("Scene not found");

        return new SceneDto(scene.Id, scene.ChapterId, scene.Title, scene.Content, scene.Status, scene.WordCount, scene.Order, scene.CreatedAt, scene.UpdatedAt);
    }
}
