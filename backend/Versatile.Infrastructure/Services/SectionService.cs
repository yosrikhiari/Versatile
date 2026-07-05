using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class SectionService : ISectionService
{
    private readonly ApplicationDbContext _db;
    public SectionService(ApplicationDbContext db) => _db = db;

    public async Task<List<SectionDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.Sections.Where(s => s.StoryId == storyId).OrderBy(s => s.Order).Select(s => ToDto(s)).ToListAsync();
    }

    public async Task<SectionDto> GetByIdAsync(Guid id, Guid userId)
    {
        var section = await _db.Sections.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId);
        return section is null ? throw new KeyNotFoundException("Section not found") : ToDto(section);
    }

    public async Task<SectionDto> CreateAsync(Guid storyId, CreateSectionRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var maxOrder = await _db.Sections.Where(s => s.StoryId == storyId).MaxAsync(s => (int?)s.Order) ?? 0;
        var section = new Section
        {
            StoryId = storyId,
            Title = request.Title,
            Summary = request.Summary,
            Content = request.Content,
            Order = maxOrder + 1,
            Status = request.Status ?? "Draft",
            Tags = request.Tags
        };
        _db.Sections.Add(section);
        await _db.SaveChangesAsync();
        return ToDto(section);
    }

    public async Task<SectionDto> UpdateAsync(Guid id, UpdateSectionRequest request, Guid userId)
    {
        var section = await _db.Sections.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId);
        if (section is null) throw new KeyNotFoundException("Section not found");
        if (request.Title is not null) section.Title = request.Title;
        if (request.Summary is not null) section.Summary = request.Summary;
        if (request.Content is not null) section.Content = request.Content;
        if (request.Order.HasValue) section.Order = request.Order.Value;
        if (request.Status is not null) section.Status = request.Status;
        if (request.Tags is not null) section.Tags = request.Tags;
        section.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(section);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var section = await _db.Sections.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId);
        if (section is null) throw new KeyNotFoundException("Section not found");
        _db.Sections.Remove(section);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static SectionDto ToDto(Section s) => new(s.Id, s.StoryId, s.VolumeId, s.Title, s.Summary, s.Content, s.Order, s.Status, s.Tags, s.CreatedAt, s.UpdatedAt);
}
