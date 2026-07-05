using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class VolumeService : IVolumeService
{
    private readonly ApplicationDbContext _db;
    public VolumeService(ApplicationDbContext db) => _db = db;

    public async Task<List<VolumeDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.Volumes.Where(e => e.StoryId == storyId).OrderBy(e => e.SortOrder).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<VolumeDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.Volumes.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("Volume not found") : ToDto(entity);
    }

    public async Task<VolumeDto> CreateAsync(Guid storyId, CreateVolumeRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var maxOrder = await _db.Volumes.Where(e => e.StoryId == storyId).MaxAsync(e => (int?)e.SortOrder) ?? 0;
        var entity = new Volume
        {
            StoryId = storyId,
            Title = request.Title,
            Description = request.Description,
            Color = request.Color ?? "#cccccc",
            SortOrder = request.SortOrder.GetValueOrDefault() > 0 ? request.SortOrder.GetValueOrDefault() : maxOrder + 1,
            ChapterIds = request.ChapterIds
        };
        _db.Volumes.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<VolumeDto> UpdateAsync(Guid id, UpdateVolumeRequest request, Guid userId)
    {
        var entity = await _db.Volumes.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("Volume not found");
        if (request.Title is not null) entity.Title = request.Title;
        if (request.Description is not null) entity.Description = request.Description;
        if (request.Color is not null) entity.Color = request.Color;
        if (request.SortOrder.HasValue) entity.SortOrder = request.SortOrder.Value;
        if (request.ChapterIds is not null) entity.ChapterIds = request.ChapterIds;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.Volumes.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("Volume not found");
        _db.Volumes.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static VolumeDto ToDto(Volume e) => new(e.Id, e.StoryId, e.Title, e.Description, e.Color, e.SortOrder, e.ChapterIds, e.CreatedAt, e.UpdatedAt);
}
