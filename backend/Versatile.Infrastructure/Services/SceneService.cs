using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Infrastructure.Services;

public class SceneService : ISceneService
{
    private readonly ApplicationDbContext _db;

    public SceneService(ApplicationDbContext db) => _db = db;

    public async Task<List<SceneDto>> GetAllAsync(Guid chapterId, Guid userId, Guid? organizationId = null)
    {
        await EnsureAccess(chapterId, userId, organizationId);

        return await _db.Scenes
            .Where(s => s.ChapterId == chapterId)
            .OrderBy(s => s.Order)
            .Select(s => ToDto(s))
            .ToListAsync();
    }

    public async Task<SceneDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var scene = await _db.Scenes
            .Include(s => s.Chapter).ThenInclude(c => c!.Story)
            .FirstOrDefaultAsync(s => s.Id == id && s.Chapter!.Story!.UserId == userId && (organizationId == null || s.Chapter!.Story!.OrganizationId == organizationId));

        return scene is null ? throw new KeyNotFoundException("Scene not found") : ToDto(scene);
    }

    public async Task<SceneDto> CreateAsync(Guid chapterId, CreateSceneRequest request, Guid userId, Guid? organizationId = null)
    {
        await EnsureAccess(chapterId, userId, organizationId);

        var maxOrder = await _db.Scenes
            .Where(s => s.ChapterId == chapterId)
            .MaxAsync(s => (int?)s.Order) ?? 0;

        var scene = new Scene
        {
            ChapterId = chapterId,
            Title = request.Title,
            Content = request.Content,
            Order = request.Order > 0 ? request.Order : maxOrder + 1,
            WordCount = CountWords(request.Content)
        };

        _db.Scenes.Add(scene);
        await _db.SaveChangesAsync();
        return ToDto(scene);
    }

    public async Task<SceneDto> UpdateAsync(Guid id, UpdateSceneRequest request, Guid userId, Guid? organizationId = null)
    {
        var scene = await _db.Scenes
            .Include(s => s.Chapter).ThenInclude(c => c!.Story)
            .FirstOrDefaultAsync(s => s.Id == id && s.Chapter!.Story!.UserId == userId && (organizationId == null || s.Chapter!.Story!.OrganizationId == organizationId));

        if (scene is null) throw new KeyNotFoundException("Scene not found");

        if (request.Title is not null) scene.Title = request.Title;
        if (request.Content is not null) { scene.Content = request.Content; scene.WordCount = CountWords(request.Content); }
        if (request.Status is not null) scene.Status = request.Status;
        if (request.Order.HasValue) scene.Order = request.Order.Value;
        scene.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToDto(scene);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var scene = await _db.Scenes
            .Include(s => s.Chapter).ThenInclude(c => c!.Story)
            .FirstOrDefaultAsync(s => s.Id == id && s.Chapter!.Story!.UserId == userId && (organizationId == null || s.Chapter!.Story!.OrganizationId == organizationId));

        if (scene is null) throw new KeyNotFoundException("Scene not found");

        _db.Scenes.Remove(scene);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureAccess(Guid chapterId, Guid userId, Guid? organizationId = null)
    {
        var chapter = await _db.Chapters.Include(c => c.Story)
            .FirstOrDefaultAsync(c => c.Id == chapterId && c.Story!.UserId == userId && (organizationId == null || c.Story!.OrganizationId == organizationId));
        if (chapter is null) throw new KeyNotFoundException("Chapter not found");
    }

    private static int CountWords(string text) => text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
    private static SceneDto ToDto(Scene s) => new(
        s.Id, s.ChapterId, s.Title, s.Content, s.Status, s.WordCount, s.Order, s.CreatedAt, s.UpdatedAt
    );
}
