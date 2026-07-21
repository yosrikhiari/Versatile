using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Annotations.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Annotations.Handlers;

public class GetAnnotationByIdHandler : IRequestHandler<GetAnnotationByIdQuery, AnnotationDto>
{
    private readonly DbContext _db;
    public GetAnnotationByIdHandler(DbContext db) => _db = db;

    public async Task<AnnotationDto> Handle(GetAnnotationByIdQuery request, CancellationToken ct)
    {
        var annotation = await _db.Set<Annotation>()
            .FirstOrDefaultAsync(a => a.Id == request.Id && a.UserId == request.UserId && a.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Annotation not found");
        return new AnnotationDto(annotation.Id, annotation.StoryId, annotation.ParagraphIndex, annotation.ParagraphId, annotation.Type, annotation.Original, annotation.Suggestion, annotation.Reason, annotation.Status, annotation.CreatedAt);
    }
}
