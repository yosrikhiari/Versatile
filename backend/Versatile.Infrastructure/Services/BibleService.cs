using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Infrastructure.Services;

public class BibleService : IBibleService
{
    private readonly ApplicationDbContext _db;

    public BibleService(ApplicationDbContext db) => _db = db;

    public async Task<List<BibleEntryDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureAccess(storyId, userId);

        return await _db.BibleEntries
            .Where(b => b.StoryId == storyId)
            .OrderBy(b => b.Category)
            .ThenBy(b => b.Title)
            .Select(b => ToDto(b))
            .ToListAsync();
    }

    public async Task<BibleEntryDto> GetByIdAsync(Guid id, Guid userId)
    {
        var entry = await _db.BibleEntries
            .Include(b => b.Story)
            .FirstOrDefaultAsync(b => b.Id == id && b.Story!.UserId == userId);

        return entry is null ? throw new KeyNotFoundException("Bible entry not found") : ToDto(entry);
    }

    public async Task<BibleEntryDto> CreateAsync(Guid storyId, CreateBibleEntryRequest request, Guid userId)
    {
        await EnsureAccess(storyId, userId);

        var entry = new BibleEntry
        {
            StoryId = storyId,
            Title = request.Title,
            Content = request.Content,
            Category = request.Category
        };

        _db.BibleEntries.Add(entry);
        await _db.SaveChangesAsync();
        return ToDto(entry);
    }

    public async Task<BibleEntryDto> UpdateAsync(Guid id, UpdateBibleEntryRequest request, Guid userId)
    {
        var entry = await _db.BibleEntries
            .Include(b => b.Story)
            .FirstOrDefaultAsync(b => b.Id == id && b.Story!.UserId == userId);

        if (entry is null) throw new KeyNotFoundException("Bible entry not found");

        if (request.Title is not null) entry.Title = request.Title;
        if (request.Content is not null) entry.Content = request.Content;
        if (request.Category is not null) entry.Category = request.Category;
        entry.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToDto(entry);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var entry = await _db.BibleEntries
            .Include(b => b.Story)
            .FirstOrDefaultAsync(b => b.Id == id && b.Story!.UserId == userId);

        if (entry is null) throw new KeyNotFoundException("Bible entry not found");

        _db.BibleEntries.Remove(entry);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static BibleEntryDto ToDto(BibleEntry b) => new(
        b.Id, b.StoryId, b.Title, b.Content, b.Category, b.CreatedAt, b.UpdatedAt
    );
}
