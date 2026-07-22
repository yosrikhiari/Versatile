using MediatR;
using Versatile.Application.RevisionComments.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.RevisionComments.Handlers;

public class CreateRevisionCommentHandler : IRequestHandler<CreateRevisionCommentCommand, RevisionCommentDto>
{
    private readonly IRepository<RevisionComment> _repo;
    private readonly IRepository<Story> _storyRepo;
    private readonly IUnitOfWork _uow;

    public CreateRevisionCommentHandler(IRepository<RevisionComment> repo, IRepository<Story> storyRepo, IUnitOfWork uow)
    {
        _repo = repo;
        _storyRepo = storyRepo;
        _uow = uow;
    }

    public async Task<RevisionCommentDto> Handle(CreateRevisionCommentCommand request, CancellationToken ct)
    {
        var stories = await _storyRepo.GetAllAsync(
            s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        if (stories.Count == 0) throw new KeyNotFoundException("Story not found");

        var comment = new RevisionComment
        {
            StoryId = request.StoryId,
            ParagraphIndex = request.ParagraphIndex,
            StartOffset = request.StartOffset,
            EndOffset = request.EndOffset,
            SelectedText = request.SelectedText,
            Comment = request.Comment,
            Resolved = request.Resolved ?? false,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };
        await _repo.AddAsync(comment, ct);
        await _uow.SaveChangesAsync(ct);
        return new RevisionCommentDto(comment.Id, comment.StoryId, comment.ParagraphIndex, comment.StartOffset, comment.EndOffset, comment.SelectedText, comment.Comment, comment.Resolved, comment.CreatedAt);
    }
}
