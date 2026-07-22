using MediatR;
using Versatile.Application.Annotations.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Annotations.Handlers;

public class CreateAnnotationHandler : IRequestHandler<CreateAnnotationCommand, AnnotationDto>
{
    private readonly IRepository<Annotation> _repo;
    private readonly IRepository<Story> _storyRepo;
    private readonly IUnitOfWork _uow;

    public CreateAnnotationHandler(IRepository<Annotation> repo, IRepository<Story> storyRepo, IUnitOfWork uow)
    {
        _repo = repo;
        _storyRepo = storyRepo;
        _uow = uow;
    }

    public async Task<AnnotationDto> Handle(CreateAnnotationCommand request, CancellationToken ct)
    {
        var stories = await _storyRepo.GetAllAsync(
            s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        if (stories.Count == 0) throw new KeyNotFoundException("Story not found");

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
        await _repo.AddAsync(annotation, ct);
        await _uow.SaveChangesAsync(ct);
        return new AnnotationDto(annotation.Id, annotation.StoryId, annotation.ParagraphIndex, annotation.ParagraphId, annotation.Type, annotation.Original, annotation.Suggestion, annotation.Reason, annotation.Status, annotation.CreatedAt);
    }
}
