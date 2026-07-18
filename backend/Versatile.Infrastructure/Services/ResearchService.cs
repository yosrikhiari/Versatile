using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Infrastructure.Services;

public class ResearchService : IResearchService
{
    private readonly ApplicationDbContext _db;

    public ResearchService(ApplicationDbContext db) => _db = db;

    public async Task<List<ResearchDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        await EnsureAccess(storyId, userId, organizationId);

        return await _db.ResearchNotes
            .Where(r => r.StoryId == storyId)
            .OrderByDescending(r => r.UpdatedAt)
            .Select(r => ToDto(r))
            .ToListAsync();
    }

    public async Task<ResearchDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var note = await _db.ResearchNotes
            .Include(r => r.Story)
            .FirstOrDefaultAsync(r => r.Id == id && r.Story!.UserId == userId && (!organizationId.HasValue || r.Story!.OrganizationId == organizationId.Value));

        return note is null ? throw new KeyNotFoundException("Research note not found") : ToDto(note);
    }

    public async Task<ResearchDto> CreateAsync(Guid storyId, CreateResearchRequest request, Guid userId, Guid? organizationId = null)
    {
        await EnsureAccess(storyId, userId, organizationId);

        var note = new Research
        {
            StoryId = storyId,
            Title = request.Title,
            Content = request.Content
        };

        _db.ResearchNotes.Add(note);
        await _db.SaveChangesAsync();
        return ToDto(note);
    }

    public async Task<ResearchDto> UpdateAsync(Guid id, UpdateResearchRequest request, Guid userId, Guid? organizationId = null)
    {
        var note = await _db.ResearchNotes
            .Include(r => r.Story)
            .FirstOrDefaultAsync(r => r.Id == id && r.Story!.UserId == userId && (!organizationId.HasValue || r.Story!.OrganizationId == organizationId.Value));

        if (note is null) throw new KeyNotFoundException("Research note not found");

        if (request.Title is not null) note.Title = request.Title;
        if (request.Content is not null) note.Content = request.Content;
        note.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToDto(note);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var note = await _db.ResearchNotes
            .Include(r => r.Story)
            .FirstOrDefaultAsync(r => r.Id == id && r.Story!.UserId == userId && (!organizationId.HasValue || r.Story!.OrganizationId == organizationId.Value));

        if (note is null) throw new KeyNotFoundException("Research note not found");

        _db.ResearchNotes.Remove(note);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureAccess(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (!organizationId.HasValue || s.OrganizationId == organizationId.Value)))
            throw new KeyNotFoundException("Story not found");
    }

    private static ResearchDto ToDto(Research r) => new(r.Id, r.StoryId, r.Title, r.Content, r.CreatedAt, r.UpdatedAt);
}
