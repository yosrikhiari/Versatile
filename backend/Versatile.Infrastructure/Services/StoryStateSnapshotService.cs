using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class StoryStateSnapshotService : IStoryStateSnapshotService
{
    private readonly ApplicationDbContext _db;
    public StoryStateSnapshotService(ApplicationDbContext db) => _db = db;

    public async Task<List<StoryStateSnapshotDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.StoryStateSnapshots.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<StoryStateSnapshotDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var entity = await _db.StoryStateSnapshots.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId));
        return entity is null ? throw new KeyNotFoundException("StoryStateSnapshot not found") : ToDto(entity);
    }

    public async Task<StoryStateSnapshotDto> CreateAsync(Guid storyId, CreateStoryStateSnapshotRequest request, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var entity = new StoryStateSnapshot
        {
            StoryId = storyId,
            Timestamp = DateTime.UtcNow,
            Data = request.Data
        };
        _db.StoryStateSnapshots.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<StoryStateSnapshotDto> UpdateAsync(Guid id, UpdateStoryStateSnapshotRequest request, Guid userId, Guid? organizationId)
    {
        var entity = await _db.StoryStateSnapshots.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId));
        if (entity is null) throw new KeyNotFoundException("StoryStateSnapshot not found");
        if (request.Data is not null) entity.Data = request.Data;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var entity = await _db.StoryStateSnapshots.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId));
        if (entity is null) throw new KeyNotFoundException("StoryStateSnapshot not found");
        _db.StoryStateSnapshots.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (organizationId == null || s.OrganizationId == organizationId)))
            throw new KeyNotFoundException("Story not found");
    }

    private static StoryStateSnapshotDto ToDto(StoryStateSnapshot e) => new(e.Id, e.StoryId, e.Timestamp, e.Data);
}
