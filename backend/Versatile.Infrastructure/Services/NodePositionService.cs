using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class NodePositionService : INodePositionService
{
    private readonly ApplicationDbContext _db;
    public NodePositionService(ApplicationDbContext db) => _db = db;

    public async Task<List<NodePositionDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.NodePositions.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<NodePositionDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.NodePositions.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("NodePosition not found") : ToDto(entity);
    }

    public async Task<NodePositionDto> CreateAsync(Guid storyId, CreateNodePositionRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new NodePosition
        {
            StoryId = storyId,
            NodeId = request.NodeId,
            NodeType = request.NodeType,
            X = request.X,
            Y = request.Y
        };
        _db.NodePositions.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<NodePositionDto> UpdateAsync(Guid id, UpdateNodePositionRequest request, Guid userId)
    {
        var entity = await _db.NodePositions.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("NodePosition not found");
        if (request.NodeId is not null) entity.NodeId = request.NodeId;
        if (request.NodeType is not null) entity.NodeType = request.NodeType;
        if (request.X.HasValue) entity.X = request.X.Value;
        if (request.Y.HasValue) entity.Y = request.Y.Value;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.NodePositions.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("NodePosition not found");
        _db.NodePositions.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static NodePositionDto ToDto(NodePosition e) => new(e.Id, e.StoryId, e.NodeId, e.NodeType, e.X, e.Y);
}
