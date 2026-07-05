using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Infrastructure.Services;

public class EntityService : IEntityService
{
    private readonly ApplicationDbContext _db;

    public EntityService(ApplicationDbContext db) => _db = db;

    public async Task<List<EntityDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureAccess(storyId, userId);

        return await _db.Entities
            .Where(e => e.StoryId == storyId)
            .OrderBy(e => e.Name)
            .Select(e => ToDto(e))
            .ToListAsync();
    }

    public async Task<EntityDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entity = await _db.Entities
            .Include(e => e.Story)
            .FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);

        return entity is null ? throw new KeyNotFoundException("Entity not found") : ToDto(entity);
    }

    public async Task<EntityDto> CreateAsync(Guid storyId, CreateEntityRequest request, Guid userId)
    {
        await EnsureAccess(storyId, userId);

        var entity = new Entity
        {
            StoryId = storyId,
            Name = request.Name,
            Type = request.Type,
            Description = request.Description,
            Metadata = request.Metadata
        };

        _db.Entities.Add(entity);
        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task<EntityDto> UpdateAsync(Guid id, UpdateEntityRequest request, Guid userId)
    {
        var entity = await _db.Entities
            .Include(e => e.Story)
            .FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);

        if (entity is null) throw new KeyNotFoundException("Entity not found");

        if (request.Name is not null) entity.Name = request.Name;
        if (request.Type is not null) entity.Type = request.Type;
        if (request.Description is not null) entity.Description = request.Description;
        if (request.Metadata is not null) entity.Metadata = request.Metadata;
        entity.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entity = await _db.Entities
            .Include(e => e.Story)
            .FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);

        if (entity is null) throw new KeyNotFoundException("Entity not found");

        _db.Entities.Remove(entity);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static EntityDto ToDto(Entity e) => new(
        e.Id, e.StoryId, e.Name, e.Type, e.Description, e.Metadata, e.CreatedAt, e.UpdatedAt
    );
}
