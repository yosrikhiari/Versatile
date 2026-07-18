using Microsoft.EntityFrameworkCore;
using Versatile.Application.Services;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Infrastructure.Data;

namespace Versatile.Infrastructure.Services;
public class GeneratedStoryService : IGeneratedStoryService
{
    private readonly ApplicationDbContext _db;
    public GeneratedStoryService(ApplicationDbContext db) => _db = db;

    public async Task<List<GeneratedStoryDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.GeneratedStories.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<GeneratedStoryDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.GeneratedStories.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (!organizationId.HasValue || e.Story!.OrganizationId == organizationId.Value));
        return entity is null ? throw new KeyNotFoundException("GeneratedStory not found") : ToDto(entity);
    }

    public async Task<GeneratedStoryDto> CreateAsync(Guid storyId, CreateGeneratedStoryRequest request, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var entity = new GeneratedStory
        {
            StoryId = storyId,
            Title = request.Title,
            Content = request.Content,
            GeneratedAt = DateTime.UtcNow,
            TotalWords = request.TotalWords ?? 0,
            QualityScore = request.QualityScore
        };
        _db.GeneratedStories.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<GeneratedStoryDto> UpdateAsync(Guid id, UpdateGeneratedStoryRequest request, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.GeneratedStories.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (!organizationId.HasValue || e.Story!.OrganizationId == organizationId.Value));
        if (entity is null) throw new KeyNotFoundException("GeneratedStory not found");
        if (request.Title is not null) entity.Title = request.Title;
        if (request.Content is not null) entity.Content = request.Content;
        if (request.TotalWords.HasValue) entity.TotalWords = request.TotalWords.Value;
        if (request.QualityScore.HasValue) entity.QualityScore = request.QualityScore.Value;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.GeneratedStories.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (!organizationId.HasValue || e.Story!.OrganizationId == organizationId.Value));
        if (entity is null) throw new KeyNotFoundException("GeneratedStory not found");
        _db.GeneratedStories.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (!organizationId.HasValue || s.OrganizationId == organizationId.Value)))
            throw new KeyNotFoundException("Story not found");
    }

    private static GeneratedStoryDto ToDto(GeneratedStory e) => new(e.Id, e.StoryId, e.Title, e.Content, e.GeneratedAt, e.TotalWords, e.QualityScore);
}
