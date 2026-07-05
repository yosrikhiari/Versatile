using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class VolumeEntityService : IVolumeEntityService
{
    private readonly ApplicationDbContext _db;
    public VolumeEntityService(ApplicationDbContext db) => _db = db;

    public async Task<List<VolumeEntityDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.VolumeEntities.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<VolumeEntityDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.VolumeEntities.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("VolumeEntity not found") : ToDto(entity);
    }

    public async Task<VolumeEntityDto> CreateAsync(Guid storyId, CreateVolumeEntityRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new VolumeEntity
        {
            StoryId = storyId,
            VolumeId = request.VolumeId,
            EntityType = request.EntityType,
            EntityId = request.EntityId,
            IsPrimary = request.IsPrimary ?? false
        };
        _db.VolumeEntities.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<VolumeEntityDto> UpdateAsync(Guid id, UpdateVolumeEntityRequest request, Guid userId)
    {
        var entity = await _db.VolumeEntities.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("VolumeEntity not found");
        if (request.VolumeId.HasValue) entity.VolumeId = request.VolumeId.Value;
        if (request.EntityType is not null) entity.EntityType = request.EntityType;
        if (request.EntityId is not null) entity.EntityId = request.EntityId;
        if (request.IsPrimary.HasValue) entity.IsPrimary = request.IsPrimary.Value;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.VolumeEntities.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("VolumeEntity not found");
        _db.VolumeEntities.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static VolumeEntityDto ToDto(VolumeEntity e) => new(e.Id, e.StoryId, e.VolumeId, e.EntityType, e.EntityId, e.IsPrimary);
}
