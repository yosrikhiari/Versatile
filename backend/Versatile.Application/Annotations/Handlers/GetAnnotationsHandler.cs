using MediatR;
using Versatile.Application.Annotations.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Annotations.Handlers;

public class GetAnnotationsHandler : IRequestHandler<GetAnnotationsQuery, List<AnnotationDto>>
{
    private readonly IRepository<Annotation> _repo;
    public GetAnnotationsHandler(IRepository<Annotation> repo) => _repo = repo;

    public async Task<List<AnnotationDto>> Handle(GetAnnotationsQuery request, CancellationToken ct)
    {
        var annotations = await _repo.GetAllAsync(
            a => a.StoryId == request.StoryId && a.UserId == request.UserId && a.OrganizationId == request.OrganizationId, ct);
        return annotations.OrderByDescending(a => a.CreatedAt)
            .Select(a => new AnnotationDto(a.Id, a.StoryId, a.ParagraphIndex, a.ParagraphId, a.Type, a.Original, a.Suggestion, a.Reason, a.Status, a.CreatedAt))
            .ToList();
    }
}
