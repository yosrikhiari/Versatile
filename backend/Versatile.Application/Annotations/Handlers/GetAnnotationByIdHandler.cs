using MediatR;
using Versatile.Application.Annotations.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Annotations.Handlers;

public class GetAnnotationByIdHandler : IRequestHandler<GetAnnotationByIdQuery, AnnotationDto>
{
    private readonly IRepository<Annotation> _repo;
    public GetAnnotationByIdHandler(IRepository<Annotation> repo) => _repo = repo;

    public async Task<AnnotationDto> Handle(GetAnnotationByIdQuery request, CancellationToken ct)
    {
        var annotations = await _repo.GetAllAsync(
            a => a.Id == request.Id && a.UserId == request.UserId && a.OrganizationId == request.OrganizationId, ct);
        var annotation = annotations.FirstOrDefault() ?? throw new KeyNotFoundException("Annotation not found");
        return new AnnotationDto(annotation.Id, annotation.StoryId, annotation.ParagraphIndex, annotation.ParagraphId, annotation.Type, annotation.Original, annotation.Suggestion, annotation.Reason, annotation.Status, annotation.CreatedAt);
    }
}
