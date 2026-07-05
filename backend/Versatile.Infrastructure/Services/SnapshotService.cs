using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class SnapshotService : ISnapshotService
{
    private readonly ApplicationDbContext _db;
    public SnapshotService(ApplicationDbContext db) => _db = db;

    public async Task<List<SnapshotDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.Snapshots.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<SnapshotDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.Snapshots.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("Snapshot not found") : ToDto(entity);
    }

    public async Task<SnapshotDto> CreateAsync(Guid storyId, CreateSnapshotRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new Snapshot
        {
            StoryId = storyId,
            ChapterId = request.ChapterId,
            Timestamp = DateTime.UtcNow,
            Label = request.Label,
            Data = request.Data
        };
        _db.Snapshots.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<SnapshotDto> UpdateAsync(Guid id, UpdateSnapshotRequest request, Guid userId)
    {
        var entity = await _db.Snapshots.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("Snapshot not found");
        if (request.ChapterId.HasValue) entity.ChapterId = request.ChapterId.Value;
        if (request.Label is not null) entity.Label = request.Label;
        if (request.Data is not null) entity.Data = request.Data;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.Snapshots.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("Snapshot not found");
        _db.Snapshots.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static SnapshotDto ToDto(Snapshot e) => new(e.Id, e.StoryId, e.ChapterId, e.Timestamp, e.Label, e.Data);
}
