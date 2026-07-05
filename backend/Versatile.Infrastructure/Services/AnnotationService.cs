using Microsoft.EntityFrameworkCore;
using Versatile.Infrastructure.Data;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
namespace Versatile.Infrastructure.Services;
public class AnnotationService : IAnnotationService
{
    private readonly ApplicationDbContext _db;
    public AnnotationService(ApplicationDbContext db) => _db = db;

    public async Task<List<AnnotationDto>> GetAllAsync(Guid storyId, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        return await _db.Annotations.Where(a => a.StoryId == storyId).OrderBy(a => a.ParagraphIndex).Select(a => ToDto(a)).ToListAsync();
    }

    public async Task<AnnotationDto> GetByIdAsync(Guid id, Guid userId)
    {
        var annotation = await _db.Annotations.Include(a => a.Story).FirstOrDefaultAsync(a => a.Id == id && a.Story!.UserId == userId);
        return annotation is null ? throw new KeyNotFoundException("Annotation not found") : ToDto(annotation);
    }

    public async Task<AnnotationDto> CreateAsync(Guid storyId, CreateAnnotationRequest request, Guid userId)
    {
        await EnsureStoryAccess(storyId, userId);
        var annotation = new Annotation
        {
            StoryId = storyId,
            ParagraphIndex = request.ParagraphIndex,
            ParagraphId = request.ParagraphId,
            Type = request.Type,
            Original = request.Original,
            Suggestion = request.Suggestion,
            Reason = request.Reason,
            Status = request.Status ?? "Open"
        };
        _db.Annotations.Add(annotation);
        await _db.SaveChangesAsync();
        return ToDto(annotation);
    }

    public async Task<AnnotationDto> UpdateAsync(Guid id, UpdateAnnotationRequest request, Guid userId)
    {
        var annotation = await _db.Annotations.Include(a => a.Story).FirstOrDefaultAsync(a => a.Id == id && a.Story!.UserId == userId);
        if (annotation is null) throw new KeyNotFoundException("Annotation not found");
        if (request.ParagraphIndex.HasValue) annotation.ParagraphIndex = request.ParagraphIndex.Value;
        if (request.ParagraphId is not null) annotation.ParagraphId = request.ParagraphId;
        if (request.Type is not null) annotation.Type = request.Type;
        if (request.Original is not null) annotation.Original = request.Original;
        if (request.Suggestion is not null) annotation.Suggestion = request.Suggestion;
        if (request.Reason is not null) annotation.Reason = request.Reason;
        if (request.Status is not null) annotation.Status = request.Status;
        await _db.SaveChangesAsync();
        return ToDto(annotation);
    }

    public async Task DeleteAsync(Guid id, Guid userId)
    {
        var annotation = await _db.Annotations.Include(a => a.Story).FirstOrDefaultAsync(a => a.Id == id && a.Story!.UserId == userId);
        if (annotation is null) throw new KeyNotFoundException("Annotation not found");
        _db.Annotations.Remove(annotation);
        await _db.SaveChangesAsync();
    }

    private async Task EnsureStoryAccess(Guid storyId, Guid userId)
    {
        if (!await _db.Stories.AnyAsync(s => s.Id == storyId && s.UserId == userId))
            throw new KeyNotFoundException("Story not found");
    }

    private static AnnotationDto ToDto(Annotation a) => new(a.Id, a.StoryId, a.ParagraphIndex, a.ParagraphId, a.Type, a.Original, a.Suggestion, a.Reason, a.Status, a.CreatedAt);
}
