using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Infrastructure.Services;

public class StoryService : IStoryService
{
    private readonly ApplicationDbContext _db;

    public StoryService(ApplicationDbContext db) => _db = db;

    public async Task<List<StoryDto>> GetAllAsync(Guid userId)
    {
        return await _db.Stories
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.UpdatedAt)
            .Select(s => ToDto(s))
            .ToListAsync();
    }

    public async Task<StoryDto> GetByIdAsync(Guid id, Guid userId)
    {
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
        return story is null ? throw new KeyNotFoundException("Story not found") : ToDto(story);
    }

    public async Task<StoryDto> CreateAsync(CreateStoryRequest request, Guid userId)
    {
        var story = new Story
        {
            Title = request.Title,
            Premise = request.Premise,
            Genre = request.Genre,
            Tone = request.Tone,
            WritingStyle = request.WritingStyle,
            TargetAudience = request.TargetAudience,
            UserId = userId
        };

        _db.Stories.Add(story);
        await _db.SaveChangesAsync();
        return ToDto(story);
    }

    public async Task<StoryDto> UpdateAsync(Guid id, UpdateStoryRequest request, Guid userId)
    {
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
        if (story is null) throw new KeyNotFoundException("Story not found");

        if (request.Title is not null) story.Title = request.Title;
        if (request.Premise is not null) story.Premise = request.Premise;
        if (request.Genre is not null) story.Genre = request.Genre;
        if (request.Tone is not null) story.Tone = request.Tone;
        if (request.WritingStyle is not null) story.WritingStyle = request.WritingStyle;
        if (request.TargetAudience is not null) story.TargetAudience = request.TargetAudience;
        story.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return ToDto(story);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
        if (story is null) throw new KeyNotFoundException("Story not found");

        _db.Stories.Remove(story);
        await _db.SaveChangesAsync();
    }

    private static StoryDto ToDto(Story s) => new(
        s.Id, s.Title, s.Premise, s.Genre, s.Tone,
        s.WritingStyle, s.TargetAudience, s.CreatedAt, s.UpdatedAt
    );
}
