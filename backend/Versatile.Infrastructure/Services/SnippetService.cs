using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class SnippetService : ISnippetService
{
    private readonly ApplicationDbContext _db;
    public SnippetService(ApplicationDbContext db) => _db = db;

    public async Task<List<SnippetDto>> GetAllAsync(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        return await _db.Snippets.Where(s => s.StoryId == storyId).OrderByDescending(s => s.Count).Select(s => ToDto(s)).ToListAsync();
    }

    public async Task<SnippetDto> GetByIdAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var snippet = await _db.Snippets.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId && (!organizationId.HasValue || s.Story!.OrganizationId == organizationId.Value));
        return snippet is null ? throw new KeyNotFoundException("Snippet not found") : ToDto(snippet);
    }

    public async Task<SnippetDto> CreateAsync(Guid storyId, CreateSnippetRequest request, Guid userId, Guid? organizationId = null)
    {
        await EnsureStoryAccess(storyId, userId, organizationId);
        var snippet = new Snippet { StoryId = storyId, Word = request.Word, Count = request.Count, LastSeen = request.LastSeen ?? DateTime.UtcNow };
        _db.Snippets.Add(snippet);
        await _db.SaveChangesAsync();
        return ToDto(snippet);
    }

    public async Task<SnippetDto> UpdateAsync(Guid id, UpdateSnippetRequest request, Guid userId, Guid? organizationId = null)
    {
        var snippet = await _db.Snippets.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId && (!organizationId.HasValue || s.Story!.OrganizationId == organizationId.Value));
        if (snippet is null) throw new KeyNotFoundException("Snippet not found");
        if (request.Word is not null) snippet.Word = request.Word;
        if (request.Count.HasValue) snippet.Count = request.Count.Value;
        if (request.LastSeen.HasValue) snippet.LastSeen = request.LastSeen.Value;
        await _db.SaveChangesAsync();
        return ToDto(snippet);
    }

    public async Task DeleteAsync(Guid id, Guid userId, Guid? organizationId = null)
    {
        var snippet = await _db.Snippets.Include(s => s.Story).FirstOrDefaultAsync(s => s.Id == id && s.Story!.UserId == userId && (!organizationId.HasValue || s.Story!.OrganizationId == organizationId.Value));
        if (snippet is null) throw new KeyNotFoundException("Snippet not found");
        _db.Snippets.Remove(snippet);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId, Guid? organizationId = null)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId && (!organizationId.HasValue || s.OrganizationId == organizationId.Value)))
            throw new KeyNotFoundException("Story not found");
    }

    private static SnippetDto ToDto(Snippet s) => new(s.Id, s.StoryId, s.Word, s.Count, s.LastSeen);
}
