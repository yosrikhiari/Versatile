using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Annotations.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Annotations.Handlers;

public class GetAnnotationsHandler : IRequestHandler<GetAnnotationsQuery, List<AnnotationDto>>
{
    private readonly DbContext _db;
    public GetAnnotationsHandler(DbContext db) => _db = db;

    public async Task<List<AnnotationDto>> Handle(GetAnnotationsQuery request, CancellationToken ct) =>
        await _db.Set<Annotation>()
            .Where(a => a.StoryId == request.StoryId && a.UserId == request.UserId && a.OrganizationId == request.OrganizationId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new AnnotationDto(a.Id, a.StoryId, a.ParagraphIndex, a.ParagraphId, a.Type, a.Original, a.Suggestion, a.Reason, a.Status, a.CreatedAt))
            .ToListAsync(ct);
}
