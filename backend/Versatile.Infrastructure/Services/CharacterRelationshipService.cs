using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class CharacterRelationshipService : ICharacterRelationshipService
{
    private readonly ApplicationDbContext _db;
    public CharacterRelationshipService(ApplicationDbContext db) => _db = db;

    public async Task<List<CharacterRelationshipDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.CharacterRelationships.Where(r => r.StoryId == storyId).Select(r => ToDto(r)).ToListAsync();
    }

    public async Task<CharacterRelationshipDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var rel = await _db.CharacterRelationships.Include(r => r.Story).FirstOrDefaultAsync(r => r.Id == id && r.Story!.UserId == userId && (organizationId == null || r.Story!.OrganizationId == organizationId));
        return rel is null ? throw new KeyNotFoundException("CharacterRelationship not found") : ToDto(rel);
    }

    public async Task<CharacterRelationshipDto> CreateAsync(Guid storyId, CreateCharacterRelationshipRequest request, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var rel = new CharacterRelationship
        {
            StoryId = storyId,
            FromCharacterId = request.FromCharacterId,
            ToCharacterId = request.ToCharacterId,
            RelationshipType = request.RelationshipType,
            Notes = request.Notes
        };
        _db.CharacterRelationships.Add(rel);
        await _db.SaveChangesAsync();
        return ToDto(rel);
    }

    public async Task<CharacterRelationshipDto> UpdateAsync(Guid id, UpdateCharacterRelationshipRequest request, Guid userId, Guid? organizationId)
    {
        var rel = await _db.CharacterRelationships.Include(r => r.Story).FirstOrDefaultAsync(r => r.Id == id && r.Story!.UserId == userId && (organizationId == null || r.Story!.OrganizationId == organizationId));
        if (rel is null) throw new KeyNotFoundException("CharacterRelationship not found");
        if (request.FromCharacterId.HasValue) rel.FromCharacterId = request.FromCharacterId.Value;
        if (request.ToCharacterId.HasValue) rel.ToCharacterId = request.ToCharacterId.Value;
        if (request.RelationshipType is not null) rel.RelationshipType = request.RelationshipType;
        if (request.Notes is not null) rel.Notes = request.Notes;
        await _db.SaveChangesAsync();
        return ToDto(rel);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var rel = await _db.CharacterRelationships.Include(r => r.Story).FirstOrDefaultAsync(r => r.Id == id && r.Story!.UserId == userId && (organizationId == null || r.Story!.OrganizationId == organizationId));
        if (rel is null) throw new KeyNotFoundException("CharacterRelationship not found");
        _db.CharacterRelationships.Remove(rel);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (organizationId == null || s.OrganizationId == organizationId)))
            throw new KeyNotFoundException("Story not found");
    }

    private static CharacterRelationshipDto ToDto(CharacterRelationship r) => new(r.Id, r.StoryId, r.FromCharacterId, r.ToCharacterId, r.RelationshipType, r.Notes, r.CreatedAt);
}
