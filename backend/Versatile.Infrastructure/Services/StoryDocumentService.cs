using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class StoryDocumentService : IStoryDocumentService
{
    private readonly ApplicationDbContext _db;
    public StoryDocumentService(ApplicationDbContext db) => _db = db;

    public async Task<List<StoryDocumentDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.StoryDocuments.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<StoryDocumentDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var entity = await _db.StoryDocuments.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId));
        return entity is null ? throw new KeyNotFoundException("StoryDocument not found") : ToDto(entity);
    }

    public async Task<StoryDocumentDto> CreateAsync(Guid storyId, CreateStoryDocumentRequest request, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var entity = new StoryDocument
        {
            StoryId = storyId,
            DocType = request.DocType,
            Title = request.Title,
            Content = request.Content
        };
        _db.StoryDocuments.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<StoryDocumentDto> UpdateAsync(Guid id, UpdateStoryDocumentRequest request, Guid userId, Guid? organizationId)
    {
        var entity = await _db.StoryDocuments.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId));
        if (entity is null) throw new KeyNotFoundException("StoryDocument not found");
        if (request.DocType is not null) entity.DocType = request.DocType;
        if (request.Title is not null) entity.Title = request.Title;
        if (request.Content is not null) entity.Content = request.Content;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var entity = await _db.StoryDocuments.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (organizationId == null || e.Story!.OrganizationId == organizationId));
        if (entity is null) throw new KeyNotFoundException("StoryDocument not found");
        _db.StoryDocuments.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (organizationId == null || s.OrganizationId == organizationId)))
            throw new KeyNotFoundException("Story not found");
    }

    private static StoryDocumentDto ToDto(StoryDocument e) => new(e.Id, e.StoryId, e.DocType, e.Title, e.Content, e.CreatedAt, e.UpdatedAt);
}
