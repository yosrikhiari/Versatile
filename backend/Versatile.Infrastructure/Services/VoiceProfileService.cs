using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class VoiceProfileService : IVoiceProfileService
{
    private readonly ApplicationDbContext _db;
    public VoiceProfileService(ApplicationDbContext db) => _db = db;

    public async Task<List<VoiceProfileDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.VoiceProfiles.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<VoiceProfileDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.VoiceProfiles.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId));
        return entity is null ? throw new KeyNotFoundException("VoiceProfile not found") : ToDto(entity);
    }

    public async Task<VoiceProfileDto> CreateAsync(Guid storyId, CreateVoiceProfileRequest request, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var entity = new VoiceProfile
        {
            StoryId = storyId,
            Name = request.Name,
            Settings = request.Settings
        };
        _db.VoiceProfiles.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<VoiceProfileDto> UpdateAsync(Guid id, UpdateVoiceProfileRequest request, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.VoiceProfiles.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId));
        if (entity is null) throw new KeyNotFoundException("VoiceProfile not found");
        if (request.Name is not null) entity.Name = request.Name;
        if (request.Settings is not null) entity.Settings = request.Settings;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.VoiceProfiles.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId));
        if (entity is null) throw new KeyNotFoundException("VoiceProfile not found");
        _db.VoiceProfiles.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (organizationId == null || s.OrganizationId == organizationId)))
            throw new KeyNotFoundException("Story not found");
    }

    private static VoiceProfileDto ToDto(VoiceProfile e) => new(e.Id, e.StoryId, e.Name, e.Settings, e.CreatedAt, e.UpdatedAt);
}
