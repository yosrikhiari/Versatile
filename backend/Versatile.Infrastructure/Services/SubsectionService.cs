using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class SubsectionService : ISubsectionService
{
    private readonly ApplicationDbContext _db;
    public SubsectionService(ApplicationDbContext db) => _db = db;

    public async Task<List<SubsectionDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.Subsections.Where(s => s.StoryId == storyId).OrderBy(s => s.Order).Select(s => ToDto(s)).ToListAsync();
    }

    public async Task<SubsectionDto> GetByIdAsync(Guid id, Guid userId)
    {
        var subsection = await _db.Subsections.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId);
        return subsection is null ? throw new KeyNotFoundException("Subsection not found") : ToDto(subsection);
    }

    public async Task<SubsectionDto> CreateAsync(Guid storyId, CreateSubsectionRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var maxOrder = await _db.Subsections.Where(s => s.StoryId == storyId).MaxAsync(s => (int?)s.Order) ?? 0;
        var subsection = new Subsection
        {
            StoryId = storyId,
            SectionId = request.SectionId,
            Title = request.Title,
            Summary = request.Summary,
            Content = request.Content,
            Order = maxOrder + 1,
            Tags = request.Tags
        };
        _db.Subsections.Add(subsection);
        await _db.SaveChangesAsync();
        return ToDto(subsection);
    }

    public async Task<SubsectionDto> UpdateAsync(Guid id, UpdateSubsectionRequest request, Guid userId)
    {
        var subsection = await _db.Subsections.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId);
        if (subsection is null) throw new KeyNotFoundException("Subsection not found");
        if (request.Title is not null) subsection.Title = request.Title;
        if (request.Summary is not null) subsection.Summary = request.Summary;
        if (request.Content is not null) subsection.Content = request.Content;
        if (request.Order.HasValue) subsection.Order = request.Order.Value;
        if (request.Tags is not null) subsection.Tags = request.Tags;
        subsection.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(subsection);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var subsection = await _db.Subsections.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId);
        if (subsection is null) throw new KeyNotFoundException("Subsection not found");
        _db.Subsections.Remove(subsection);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static SubsectionDto ToDto(Subsection s) => new(s.Id, s.StoryId, s.SectionId, s.Title, s.Summary, s.Content, s.Order, s.Tags, s.CreatedAt, s.UpdatedAt);
}
