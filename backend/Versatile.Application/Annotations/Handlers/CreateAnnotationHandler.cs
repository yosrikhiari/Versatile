using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Annotations.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Annotations.Handlers;

public class CreateAnnotationHandler : IRequestHandler<CreateAnnotationCommand, AnnotationDto>
{
    private readonly DbContext _db;
    public CreateAnnotationHandler(DbContext db) => _db = db;

    public async Task<AnnotationDto> Handle(CreateAnnotationCommand request, CancellationToken ct)
    {
        var storyExists = await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        if (!storyExists) throw new KeyNotFoundException("Story not found");

        var annotation = new Annotation
        {
            StoryId = request.StoryId,
            ParagraphIndex = request.ParagraphIndex,
            ParagraphId = request.ParagraphId,
            Type = request.Type,
            Original = request.Original,
            Suggestion = request.Suggestion,
            Reason = request.Reason,
            Status = request.Status ?? "pending",
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };
        _db.Set<Annotation>().Add(annotation);
        await _db.SaveChangesAsync(ct);
        return new AnnotationDto(annotation.Id, annotation.StoryId, annotation.ParagraphIndex, annotation.ParagraphId, annotation.Type, annotation.Original, annotation.Suggestion, annotation.Reason, annotation.Status, annotation.CreatedAt);
    }
}
