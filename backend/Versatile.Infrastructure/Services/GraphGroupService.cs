using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class GraphGroupService : IGraphGroupService
{
    private readonly ApplicationDbContext _db;
    public GraphGroupService(ApplicationDbContext db) => _db = db;

    public async Task<List<GraphGroupDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.GraphGroups.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<GraphGroupDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.GraphGroups.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return entity is null ? throw new KeyNotFoundException("GraphGroup not found") : ToDto(entity);
    }

    public async Task<GraphGroupDto> CreateAsync(Guid storyId, CreateGraphGroupRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var entity = new GraphGroup
        {
            StoryId = storyId,
            Label = request.Label,
            Color = request.Color,
            Data = request.Data
        };
        _db.GraphGroups.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<GraphGroupDto> UpdateAsync(Guid id, UpdateGraphGroupRequest request, Guid userId)
    {
        var entity = await _db.GraphGroups.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("GraphGroup not found");
        if (request.Label is not null) entity.Label = request.Label;
        if (request.Color is not null) entity.Color = request.Color;
        if (request.Data is not null) entity.Data = request.Data;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.GraphGroups.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (entity is null) throw new KeyNotFoundException("GraphGroup not found");
        _db.GraphGroups.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static GraphGroupDto ToDto(GraphGroup e) => new(e.Id, e.StoryId, e.Label, e.Color, e.Data);
}
