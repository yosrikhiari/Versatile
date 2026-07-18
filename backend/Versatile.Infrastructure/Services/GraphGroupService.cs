using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class GraphGroupService : IGraphGroupService
{
    private readonly ApplicationDbContext _db;
    public GraphGroupService(ApplicationDbContext db) => _db = db;

    public async Task<List<GraphGroupDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.GraphGroups.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<GraphGroupDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.GraphGroups.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (!organizationId.HasValue || e.Story!.OrganizationId == organizationId.Value));
        return entity is null ? throw new KeyNotFoundException("GraphGroup not found") : ToDto(entity);
    }

    public async Task<GraphGroupDto> CreateAsync(Guid storyId, CreateGraphGroupRequest request, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
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

    public async Task<GraphGroupDto> UpdateAsync(Guid id, UpdateGraphGroupRequest request, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.GraphGroups.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (!organizationId.HasValue || e.Story!.OrganizationId == organizationId.Value));
        if (entity is null) throw new KeyNotFoundException("GraphGroup not found");
        if (request.Label is not null) entity.Label = request.Label;
        if (request.Color is not null) entity.Color = request.Color;
        if (request.Data is not null) entity.Data = request.Data;
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var entity = await _db.GraphGroups.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId && (!organizationId.HasValue || e.Story!.OrganizationId == organizationId.Value));
        if (entity is null) throw new KeyNotFoundException("GraphGroup not found");
        _db.GraphGroups.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (!organizationId.HasValue || s.OrganizationId == organizationId.Value)))
            throw new KeyNotFoundException("Story not found");
    }

    private static GraphGroupDto ToDto(GraphGroup e) => new(e.Id, e.StoryId, e.Label, e.Color, e.Data);
}
