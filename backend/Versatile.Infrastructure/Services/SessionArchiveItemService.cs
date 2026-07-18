using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class SessionArchiveItemService : ISessionArchiveItemService
{
    private readonly ApplicationDbContext _db;
    public SessionArchiveItemService(ApplicationDbContext db) => _db = db;

    public async Task<List<SessionArchiveItemDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.SessionArchiveItems.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<SessionArchiveItemDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.SessionArchiveItems.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (!organizationId.HasValue || e.Story!.OrganizationId == organizationId.Value));
        return entity is null ? throw new KeyNotFoundException("SessionArchiveItem not found") : ToDto(entity);
    }

    public async Task<SessionArchiveItemDto> CreateAsync(Guid storyId, CreateSessionArchiveItemRequest request, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var entity = new SessionArchiveItem
        {
            StoryId = storyId,
            Signal = request.Signal,
            Type = request.Type,
            Timestamp = request.Timestamp ?? DateTime.UtcNow,
            Data = request.Data
        };
        _db.SessionArchiveItems.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<SessionArchiveItemDto> UpdateAsync(Guid id, UpdateSessionArchiveItemRequest request, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.SessionArchiveItems.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (!organizationId.HasValue || e.Story!.OrganizationId == organizationId.Value));
        if (entity is null) throw new KeyNotFoundException("SessionArchiveItem not found");
        if (request.Signal is not null) entity.Signal = request.Signal;
        if (request.Type is not null) entity.Type = request.Type;
        if (request.Timestamp.HasValue) entity.Timestamp = request.Timestamp.Value;
        if (request.Data is not null) entity.Data = request.Data;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.SessionArchiveItems.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (!organizationId.HasValue || e.Story!.OrganizationId == organizationId.Value));
        if (entity is null) throw new KeyNotFoundException("SessionArchiveItem not found");
        _db.SessionArchiveItems.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (!organizationId.HasValue || s.OrganizationId == organizationId.Value)))
            throw new KeyNotFoundException("Story not found");
    }

    private static SessionArchiveItemDto ToDto(SessionArchiveItem e) => new(e.Id, e.StoryId, e.Signal, e.Type, e.Timestamp, e.Data);
}
