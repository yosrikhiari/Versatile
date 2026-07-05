using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class ResearchDocumentService : IResearchDocumentService
{
    private readonly ApplicationDbContext _db;
    public ResearchDocumentService(ApplicationDbContext db) => _db = db;

    public async Task<List<ResearchDocumentDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.ResearchDocuments.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<ResearchDocumentDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.ResearchDocuments.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("ResearchDocument not found") : ToDto(entity);
    }

    public async Task<ResearchDocumentDto> CreateAsync(Guid storyId, CreateResearchDocumentRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new ResearchDocument
        {
            StoryId = storyId,
            FileName = request.FileName,
            FileType = request.FileType,
            ImportedAt = DateTime.UtcNow,
            Content = request.Content,
            Notes = request.Notes
        };
        _db.ResearchDocuments.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<ResearchDocumentDto> UpdateAsync(Guid id, UpdateResearchDocumentRequest request, Guid userId)
    {
        var entity = await _db.ResearchDocuments.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("ResearchDocument not found");
        if (request.FileName is not null) entity.FileName = request.FileName;
        if (request.FileType is not null) entity.FileType = request.FileType;
        if (request.Content is not null) entity.Content = request.Content;
        if (request.Notes is not null) entity.Notes = request.Notes;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.ResearchDocuments.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("ResearchDocument not found");
        _db.ResearchDocuments.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static ResearchDocumentDto ToDto(ResearchDocument e) => new(e.Id, e.StoryId, e.FileName, e.FileType, e.ImportedAt, e.Content, e.Notes, e.CreatedAt);
}
