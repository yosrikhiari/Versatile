using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Annotations.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Annotations.Handlers;

public class UpdateAnnotationHandler : IRequestHandler<UpdateAnnotationCommand, AnnotationDto>
{
    private readonly DbContext _db;
    public UpdateAnnotationHandler(DbContext db) => _db = db;

    public async Task<AnnotationDto> Handle(UpdateAnnotationCommand request, CancellationToken ct)
    {
        var annotation = await _db.Set<Annotation>()
            .FirstOrDefaultAsync(a => a.Id == request.Id && a.UserId == request.UserId && a.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Annotation not found");
        if (request.ParagraphIndex.HasValue) annotation.ParagraphIndex = request.ParagraphIndex.Value;
        if (request.ParagraphId is not null) annotation.ParagraphId = request.ParagraphId;
        if (request.Type is not null) annotation.Type = request.Type;
        if (request.Original is not null) annotation.Original = request.Original;
        if (request.Suggestion is not null) annotation.Suggestion = request.Suggestion;
        if (request.Reason is not null) annotation.Reason = request.Reason;
        if (request.Status is not null) annotation.Status = request.Status;
        annotation.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return new AnnotationDto(annotation.Id, annotation.StoryId, annotation.ParagraphIndex, annotation.ParagraphId, annotation.Type, annotation.Original, annotation.Suggestion, annotation.Reason, annotation.Status, annotation.CreatedAt);
    }
}
