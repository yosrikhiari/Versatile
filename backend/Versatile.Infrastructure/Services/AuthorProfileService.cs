using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class AuthorProfileService : IAuthorProfileService
{
    private readonly ApplicationDbContext _db;
    public AuthorProfileService(ApplicationDbContext db) => _db = db;

    public async Task<List<AuthorProfileDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.AuthorProfiles.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<AuthorProfileDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.AuthorProfiles.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("AuthorProfile not found") : ToDto(entity);
    }

    public async Task<AuthorProfileDto> CreateAsync(Guid storyId, CreateAuthorProfileRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new AuthorProfile
        {
            StoryId = storyId,
            DisplayName = request.DisplayName,
            PenName = request.PenName,
            Bio = request.Bio,
            Settings = request.Settings
        };
        _db.AuthorProfiles.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<AuthorProfileDto> UpdateAsync(Guid id, UpdateAuthorProfileRequest request, Guid userId)
    {
        var entity = await _db.AuthorProfiles.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("AuthorProfile not found");
        if (request.DisplayName is not null) entity.DisplayName = request.DisplayName;
        if (request.PenName is not null) entity.PenName = request.PenName;
        if (request.Bio is not null) entity.Bio = request.Bio;
        if (request.Settings is not null) entity.Settings = request.Settings;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.AuthorProfiles.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("AuthorProfile not found");
        _db.AuthorProfiles.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static AuthorProfileDto ToDto(AuthorProfile e) => new(e.Id, e.StoryId, e.DisplayName, e.PenName, e.Bio, e.Settings, e.CreatedAt, e.UpdatedAt);
}
