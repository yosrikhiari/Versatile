using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class RevisionCommentService : IRevisionCommentService
{
    private readonly ApplicationDbContext _db;
    public RevisionCommentService(ApplicationDbContext db) => _db = db;

    public async Task<List<RevisionCommentDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.RevisionComments.Where(r => r.StoryId == storyId).OrderByDescending(r => r.CreatedAt).Select(r => ToDto(r)).ToListAsync();
    }

    public async Task<RevisionCommentDto> GetByIdAsync(Guid id, Guid userId)
    {
        var comment = await _db.RevisionComments.Include(r => r.Story).FirstOrDefaultAsync(r => r.Id == id && r.Story!.UserId == userId);
        return comment is null ? throw new KeyNotFoundException("RevisionComment not found") : ToDto(comment);
    }

    public async Task<RevisionCommentDto> CreateAsync(Guid storyId, CreateRevisionCommentRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var comment = new RevisionComment
        {
            StoryId = storyId,
            ParagraphIndex = request.ParagraphIndex,
            StartOffset = request.StartOffset,
            EndOffset = request.EndOffset,
            SelectedText = request.SelectedText,
            Comment = request.Comment,
            Resolved = request.Resolved ?? false
        };
        _db.RevisionComments.Add(comment);
        await _db.SaveChangesAsync();
        return ToDto(comment);
    }

    public async Task<RevisionCommentDto> UpdateAsync(Guid id, UpdateRevisionCommentRequest request, Guid userId)
    {
        var comment = await _db.RevisionComments.Include(r => r.Story).FirstOrDefaultAsync(r => r.Id == id && r.Story!.UserId == userId);
        if (comment is null) throw new KeyNotFoundException("RevisionComment not found");
        if (request.ParagraphIndex.HasValue) comment.ParagraphIndex = request.ParagraphIndex.Value;
        if (request.StartOffset.HasValue) comment.StartOffset = request.StartOffset.Value;
        if (request.EndOffset.HasValue) comment.EndOffset = request.EndOffset.Value;
        if (request.SelectedText is not null) comment.SelectedText = request.SelectedText;
        if (request.Comment is not null) comment.Comment = request.Comment;
        if (request.Resolved.HasValue) comment.Resolved = request.Resolved.Value;
        await _db.SaveChangesAsync();
        return ToDto(comment);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var comment = await _db.RevisionComments.Include(r => r.Story).FirstOrDefaultAsync(r => r.Id == id && r.Story!.UserId == userId);
        if (comment is null) throw new KeyNotFoundException("RevisionComment not found");
        _db.RevisionComments.Remove(comment);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static RevisionCommentDto ToDto(RevisionComment r) => new(r.Id, r.StoryId, r.ParagraphIndex, r.StartOffset, r.EndOffset, r.SelectedText, r.Comment, r.Resolved, r.CreatedAt);
}
