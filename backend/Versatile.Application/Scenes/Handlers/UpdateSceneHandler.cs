using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Commands;
using Versatile.Domain.Entities;

namespace Versatile.Application.Scenes.Handlers;

public class UpdateSceneHandler : IRequestHandler<UpdateSceneCommand, SceneDto>
{
    private readonly DbContext _db;

    public UpdateSceneHandler(DbContext db) => _db = db;

    public async Task<SceneDto> Handle(UpdateSceneCommand request, CancellationToken ct)
    {
        var scene = await _db.Set<Scene>()
            .Include(s => s.Chapter).ThenInclude(c => c!.Story)
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.Chapter!.Story!.UserId == request.UserId && s.Chapter!.Story!.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Scene not found");

        if (request.Title is not null) scene.Title = request.Title;
        if (request.Content is not null) { scene.Content = request.Content; scene.WordCount = CountWords(request.Content); }
        if (request.Status is not null) scene.Status = request.Status;
        if (request.Order.HasValue) scene.Order = request.Order.Value;
        scene.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return ToDto(scene);
    }

    private static int CountWords(string text) =>
        text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;

    private static SceneDto ToDto(Scene s) => new(
        s.Id, s.ChapterId, s.Title, s.Content, s.Status, s.WordCount, s.Order, s.CreatedAt, s.UpdatedAt
    );
}
