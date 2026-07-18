using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class ManuscriptService : IManuscriptService
{
    private readonly ApplicationDbContext _db;
    public ManuscriptService(ApplicationDbContext db) => _db = db;

    public async Task<List<ManuscriptDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.Manuscripts.Where(m => m.StoryId == storyId).Select(m => ToDto(m)).ToListAsync();
    }

    public async Task<ManuscriptDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var manuscript = await _db.Manuscripts.Include(m => m.Story).FirstOrDefaultAsync(m => m.Id == id && m.Story!.UserId == userId && (organizationId == null || m.Story!.OrganizationId == organizationId));
        return manuscript is null ? throw new KeyNotFoundException("Manuscript not found") : ToDto(manuscript);
    }

    public async Task<ManuscriptDto> CreateAsync(Guid storyId, CreateManuscriptRequest request, Guid userId, Guid? organizationId)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var manuscript = new Manuscript { StoryId = storyId, Title = request.Title, Content = request.Content, WordCount = request.WordCount ?? 0 };
        _db.Manuscripts.Add(manuscript);
        await _db.SaveChangesAsync();
        return ToDto(manuscript);
    }

    public async Task<ManuscriptDto> UpdateAsync(Guid id, UpdateManuscriptRequest request, Guid userId, Guid? organizationId)
    {
        var manuscript = await _db.Manuscripts.Include(m => m.Story).FirstOrDefaultAsync(m => m.Id == id && m.Story!.UserId == userId && (organizationId == null || m.Story!.OrganizationId == organizationId));
        if (manuscript is null) throw new KeyNotFoundException("Manuscript not found");
        if (request.Title is not null) manuscript.Title = request.Title;
        if (request.Content is not null) manuscript.Content = request.Content;
        if (request.WordCount.HasValue) manuscript.WordCount = request.WordCount.Value;
        manuscript.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return ToDto(manuscript);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId)
    {
        var manuscript = await _db.Manuscripts.Include(m => m.Story).FirstOrDefaultAsync(m => m.Id == id && m.Story!.UserId == userId && (organizationId == null || m.Story!.OrganizationId == organizationId));
        if (manuscript is null) throw new KeyNotFoundException("Manuscript not found");
        _db.Manuscripts.Remove(manuscript);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (organizationId == null || s.OrganizationId == organizationId)))
            throw new KeyNotFoundException("Story not found");
    }

    private static ManuscriptDto ToDto(Manuscript m) => new(m.Id, m.StoryId, m.Title, m.Content, m.WordCount, m.CreatedAt, m.UpdatedAt);
}
