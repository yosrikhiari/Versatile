using MediatR;
using Versatile.Application.Annotations.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Annotations.Handlers;

public class UpdateAnnotationHandler : IRequestHandler<UpdateAnnotationCommand, AnnotationDto>
{
    private readonly IRepository<Annotation> _repo;
    private readonly IUnitOfWork _uow;

    public UpdateAnnotationHandler(IRepository<Annotation> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<AnnotationDto> Handle(UpdateAnnotationCommand request, CancellationToken ct)
    {
        var annotations = await _repo.GetAllAsync(
            a => a.Id == request.Id && a.UserId == request.UserId && a.OrganizationId == request.OrganizationId, ct);
        var annotation = annotations.FirstOrDefault() ?? throw new KeyNotFoundException("Annotation not found");
        if (request.ParagraphIndex.HasValue) annotation.ParagraphIndex = request.ParagraphIndex.Value;
        if (request.ParagraphId is not null) annotation.ParagraphId = request.ParagraphId;
        if (request.Type is not null) annotation.Type = request.Type;
        if (request.Original is not null) annotation.Original = request.Original;
        if (request.Suggestion is not null) annotation.Suggestion = request.Suggestion;
        if (request.Reason is not null) annotation.Reason = request.Reason;
        if (request.Status is not null) annotation.Status = request.Status;
        annotation.UpdatedAt = DateTime.UtcNow;
        _repo.Update(annotation);
        await _uow.SaveChangesAsync(ct);
        return new AnnotationDto(annotation.Id, annotation.StoryId, annotation.ParagraphIndex, annotation.ParagraphId, annotation.Type, annotation.Original, annotation.Suggestion, annotation.Reason, annotation.Status, annotation.CreatedAt);
    }
}
