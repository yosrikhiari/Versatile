using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class SparkHistoryItemService : ISparkHistoryItemService
{
    private readonly ApplicationDbContext _db;
    public SparkHistoryItemService(ApplicationDbContext db) => _db = db;

    public async Task<List<SparkHistoryItemDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.SparkHistoryItems.Where(s => s.StoryId == storyId).OrderByDescending(s => s.CreatedAt).Select(s => ToDto(s)).ToListAsync();
    }

    public async Task<SparkHistoryItemDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var item = await _db.SparkHistoryItems.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId && (!organizationId.HasValue || s.Story!.OrganizationId == organizationId.Value));
        return item is null ? throw new KeyNotFoundException("SparkHistoryItem not found") : ToDto(item);
    }

    public async Task<SparkHistoryItemDto> CreateAsync(Guid storyId, CreateSparkHistoryItemRequest request, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var item = new SparkHistoryItem { StoryId = storyId, Type = request.Type, Prompt = request.Prompt, Blueprint = request.Blueprint, GeneratedContent = request.GeneratedContent };
        _db.SparkHistoryItems.Add(item);
        await _db.SaveChangesAsync();
        return ToDto(item);
    }

    public async Task<SparkHistoryItemDto> UpdateAsync(Guid id, UpdateSparkHistoryItemRequest request, Guid userId, Guid? organizationId = null)
    {
        var item = await _db.SparkHistoryItems.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId && (!organizationId.HasValue || s.Story!.OrganizationId == organizationId.Value));
        if (item is null) throw new KeyNotFoundException("SparkHistoryItem not found");
        if (request.Type is not null) item.Type = request.Type;
        if (request.Prompt is not null) item.Prompt = request.Prompt;
        if (request.Blueprint is not null) item.Blueprint = request.Blueprint;
        if (request.GeneratedContent is not null) item.GeneratedContent = request.GeneratedContent;
        await _db.SaveChangesAsync();
        return ToDto(item);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var item = await _db.SparkHistoryItems.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId && (!organizationId.HasValue || s.Story!.OrganizationId == organizationId.Value));
        if (item is null) throw new KeyNotFoundException("SparkHistoryItem not found");
        _db.SparkHistoryItems.Remove(item);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (!organizationId.HasValue || s.OrganizationId == organizationId.Value)))
            throw new KeyNotFoundException("Story not found");
    }

    private static SparkHistoryItemDto ToDto(SparkHistoryItem s) => new(s.Id, s.StoryId, s.Type, s.Prompt, s.Blueprint, s.GeneratedContent, s.CreatedAt);
}
