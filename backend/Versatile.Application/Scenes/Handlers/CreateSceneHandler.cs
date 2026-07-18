using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Scenes.Commands;
using Versatile.Domain.Entities;

namespace Versatile.Application.Scenes.Handlers;

public class CreateSceneHandler : IRequestHandler<CreateSceneCommand, SceneDto>
{
    private readonly DbContext _db;

    public CreateSceneHandler(DbContext db) => _db = db;

    public async Task<SceneDto> Handle(CreateSceneCommand request, CancellationToken ct)
    {
        var chapter = await _db.Set<Chapter>()
            .Include(c => c.Story)
            .FirstOrDefaultAsync(c => c.Id == request.ChapterId && c.Story!.UserId == request.UserId && c.Story!.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Chapter not found");

        var maxOrder = await _db.Set<Scene>()
            .Where(s => s.ChapterId == request.ChapterId)
            .MaxAsync(s => (int?)s.Order, ct) ?? 0;

        var scene = new Scene
        {
            ChapterId = request.ChapterId,
            Title = request.Title,
            Content = request.Content,
            Order = request.Order > 0 ? request.Order : maxOrder + 1,
            WordCount = CountWords(request.Content)
        };

        _db.Set<Scene>().Add(scene);
        await _db.SaveChangesAsync(ct);

        return ToDto(scene);
    }

    private static int CountWords(string text) =>
        text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;

    private static SceneDto ToDto(Scene s) => new(
        s.Id, s.ChapterId, s.Title, s.Content, s.Status, s.WordCount, s.Order, s.CreatedAt, s.UpdatedAt
    );
}
