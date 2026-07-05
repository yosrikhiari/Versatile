using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class GraphEdgeService : IGraphEdgeService
{
    private readonly ApplicationDbContext _db;
    public GraphEdgeService(ApplicationDbContext db) => _db = db;

    public async Task<List<GraphEdgeDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.GraphEdges.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<GraphEdgeDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.GraphEdges.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("GraphEdge not found") : ToDto(entity);
    }

    public async Task<GraphEdgeDto> CreateAsync(Guid storyId, CreateGraphEdgeRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new GraphEdge
        {
            StoryId = storyId,
            SourceId = request.SourceId,
            TargetId = request.TargetId,
            SourceType = request.SourceType,
            TargetType = request.TargetType,
            RelationshipType = request.RelationshipType,
            Label = request.Label,
            VolumeId = request.VolumeId
        };
        _db.GraphEdges.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<GraphEdgeDto> UpdateAsync(Guid id, UpdateGraphEdgeRequest request, Guid userId)
    {
        var entity = await _db.GraphEdges.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("GraphEdge not found");
        if (request.SourceId is not null) entity.SourceId = request.SourceId;
        if (request.TargetId is not null) entity.TargetId = request.TargetId;
        if (request.SourceType is not null) entity.SourceType = request.SourceType;
        if (request.TargetType is not null) entity.TargetType = request.TargetType;
        if (request.RelationshipType is not null) entity.RelationshipType = request.RelationshipType;
        if (request.Label is not null) entity.Label = request.Label;
        if (request.VolumeId.HasValue) entity.VolumeId = request.VolumeId.Value;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.GraphEdges.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("GraphEdge not found");
        _db.GraphEdges.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static GraphEdgeDto ToDto(GraphEdge e) => new(e.Id, e.StoryId, e.SourceId, e.TargetId, e.SourceType, e.TargetType, e.RelationshipType, e.Label, e.VolumeId);
}
