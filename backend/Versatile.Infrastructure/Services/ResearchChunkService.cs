using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class ResearchChunkService : IResearchChunkService
{
    private readonly ApplicationDbContext _db;
    public ResearchChunkService(ApplicationDbContext db) => _db = db;

    public async Task<List<ResearchChunkDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.ResearchChunks.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<ResearchChunkDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.ResearchChunks.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("ResearchChunk not found") : ToDto(entity);
    }

    public async Task<ResearchChunkDto> CreateAsync(Guid storyId, CreateResearchChunkRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new ResearchChunk
        {
            StoryId = storyId,
            DocumentId = request.DocumentId,
            ChunkIndex = request.ChunkIndex,
            Content = request.Content,
            Embedding = request.Embedding
        };
        _db.ResearchChunks.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<ResearchChunkDto> UpdateAsync(Guid id, UpdateResearchChunkRequest request, Guid userId)
    {
        var entity = await _db.ResearchChunks.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("ResearchChunk not found");
        if (request.ChunkIndex.HasValue) entity.ChunkIndex = request.ChunkIndex.Value;
        if (request.Content is not null) entity.Content = request.Content;
        if (request.Embedding is not null) entity.Embedding = request.Embedding;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.ResearchChunks.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("ResearchChunk not found");
        _db.ResearchChunks.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static ResearchChunkDto ToDto(ResearchChunk e) => new(e.Id, e.StoryId, e.DocumentId, e.ChunkIndex, e.Content, e.Embedding, e.CreatedAt);
}
