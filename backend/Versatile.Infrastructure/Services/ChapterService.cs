using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Infrastructure.Services;

public class ChapterService : IChapterService
{
    private readonly ApplicationDbContext _db;

    public ChapterService(ApplicationDbContext db) => _db = db;

    public async Task<List<ChapterDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);

        return await _db.Chapters
            .Where(c => c.StoryId == storyId)
            .OrderBy(c => c.Order)
            .Select(c => ToDto(c))
            .ToListAsync();
    }

    public async Task<ChapterDto> GetByIdAsync(Guid id, Guid userId)
    {
        var chapter = await _db.Chapters
            .Include(c => c.Story)
            .FirstOrDefaultAsync(c => c.Id == id && c.Story!.UserId == userId);

        return chapter is null ? throw new KeyNotFoundException("Chapter not found") : ToDto(chapter);
    }

    public async Task<ChapterDto> CreateAsync(Guid storyId, CreateChapterRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);

        var maxOrder = await _db.Chapters
            .Where(c => c.StoryId == storyId)
            .MaxAsync(c => (int?)c.Order) ?? 0;

        var chapter = new Chapter
        {
            StoryId = storyId,
            Title = request.Title,
            Order = request.Order > 0 ? request.Order : maxOrder + 1,
            ArcAssignment = request.ArcAssignment
        };

        _db.Chapters.Add(chapter);
        await _db.SaveChangesAsync();
        return ToDto(chapter);
    }

    public async Task<ChapterDto> UpdateAsync(Guid id, UpdateChapterRequest request, Guid userId)
    {
        var chapter = await _db.Chapters
            .Include(c => c.Story)
            .FirstOrDefaultAsync(c => c.Id == id && c.Story!.UserId == userId);

        if (chapter is null) throw new KeyNotFoundException("Chapter not found");

        if (request.Title is not null) chapter.Title = request.Title;
        if (request.Order.HasValue) chapter.Order = request.Order.Value;
        if (request.Status is not null) chapter.Status = request.Status;
        if (request.ArcAssignment is not null) chapter.ArcAssignment = request.ArcAssignment;
        chapter.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToDto(chapter);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var chapter = await _db.Chapters
            .Include(c => c.Story)
            .FirstOrDefaultAsync(c => c.Id == id && c.Story!.UserId == userId);

        if (chapter is null) throw new KeyNotFoundException("Chapter not found");

        _db.Chapters.Remove(chapter);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static ChapterDto ToDto(Chapter c) => new(
        c.Id, c.StoryId, c.Title, c.Order, c.Status, c.ArcAssignment, c.CreatedAt, c.UpdatedAt
    );
}
