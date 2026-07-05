using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class StoryElementService : IStoryElementService
{
    private readonly ApplicationDbContext _db;
    public StoryElementService(ApplicationDbContext db) => _db = db;

    public async Task<List<StoryElementDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.StoryElements.Where(e => e.StoryId == storyId).Select(e => ToDto(e)).ToListAsync();
    }

    public async Task<StoryElementDto> GetByIdAsync(Guid id, Guid userId)
    {
        var element = await _db.StoryElements.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        return element is null ? throw new KeyNotFoundException("StoryElement not found") : ToDto(element);
    }

    public async Task<StoryElementDto> CreateAsync(Guid storyId, CreateStoryElementRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var element = new StoryElement
        {
            StoryId = storyId,
            Type = request.Type,
            Title = request.Title,
            X = request.X,
            Y = request.Y,
            Width = request.Width ?? 200,
            Height = request.Height ?? 100,
            Data = request.Data
        };
        _db.StoryElements.Add(element);
        await _db.SaveChangesAsync();
        return ToDto(element);
    }

    public async Task<StoryElementDto> UpdateAsync(Guid id, UpdateStoryElementRequest request, Guid userId)
    {
        var element = await _db.StoryElements.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (element is null) throw new KeyNotFoundException("StoryElement not found");
        if (request.Type is not null) element.Type = request.Type;
        if (request.Title is not null) element.Title = request.Title;
        if (request.X.HasValue) element.X = request.X.Value;
        if (request.Y.HasValue) element.Y = request.Y.Value;
        if (request.Width.HasValue) element.Width = request.Width.Value;
        if (request.Height.HasValue) element.Height = request.Height.Value;
        if (request.Data is not null) element.Data = request.Data;
        await _db.SaveChangesAsync();
        return ToDto(element);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var element = await _db.StoryElements.Include(e => e.Story).FirstOrDefaultAsync(e => e.Id == id && e.Story!.UserId == userId);
        if (element is null) throw new KeyNotFoundException("StoryElement not found");
        _db.StoryElements.Remove(element);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static StoryElementDto ToDto(StoryElement e) => new(e.Id, e.StoryId, e.Type, e.Title, e.X, e.Y, e.Width, e.Height, e.Data);
}
