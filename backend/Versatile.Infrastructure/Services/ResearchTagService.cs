using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class ResearchTagService : IResearchTagService
{
    private readonly ApplicationDbContext _db;
    public ResearchTagService(ApplicationDbContext db) => _db = db;

    public async Task<List<ResearchTagDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.ResearchTags.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<ResearchTagDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.ResearchTags.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("ResearchTag not found") : ToDto(entity);
    }

    public async Task<ResearchTagDto> CreateAsync(Guid storyId, CreateResearchTagRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new ResearchTag
        {
            StoryId = storyId,
            Name = request.Name,
            Color = request.Color ?? "#cccccc"
        };
        _db.ResearchTags.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<ResearchTagDto> UpdateAsync(Guid id, UpdateResearchTagRequest request, Guid userId)
    {
        var entity = await _db.ResearchTags.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("ResearchTag not found");
        if (request.Name is not null) entity.Name = request.Name;
        if (request.Color is not null) entity.Color = request.Color;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.ResearchTags.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("ResearchTag not found");
        _db.ResearchTags.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static ResearchTagDto ToDto(ResearchTag e) => new(e.Id, e.StoryId, e.Name, e.Color);
}
