using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class GroupEdgeService : IGroupEdgeService
{
    private readonly ApplicationDbContext _db;
    public GroupEdgeService(ApplicationDbContext db) => _db = db;

    public async Task<List<GroupEdgeDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.GroupEdges.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<GroupEdgeDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.GroupEdges.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("GroupEdge not found") : ToDto(entity);
    }

    public async Task<GroupEdgeDto> CreateAsync(Guid storyId, CreateGroupEdgeRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new GroupEdge
        {
            StoryId = storyId,
            SourceGroupId = request.SourceGroupId,
            TargetGroupId = request.TargetGroupId,
            RelationshipType = request.RelationshipType
        };
        _db.GroupEdges.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<GroupEdgeDto> UpdateAsync(Guid id, UpdateGroupEdgeRequest request, Guid userId)
    {
        var entity = await _db.GroupEdges.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("GroupEdge not found");
        if (request.SourceGroupId is not null) entity.SourceGroupId = request.SourceGroupId;
        if (request.TargetGroupId is not null) entity.TargetGroupId = request.TargetGroupId;
        if (request.RelationshipType is not null) entity.RelationshipType = request.RelationshipType;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.GroupEdges.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("GroupEdge not found");
        _db.GroupEdges.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static GroupEdgeDto ToDto(GroupEdge e) => new(e.Id, e.StoryId, e.SourceGroupId, e.TargetGroupId, e.RelationshipType);
}
