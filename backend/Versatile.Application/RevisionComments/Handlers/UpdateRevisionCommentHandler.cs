using MediatR;
using Versatile.Application.RevisionComments.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.RevisionComments.Handlers;

public class UpdateRevisionCommentHandler : IRequestHandler<UpdateRevisionCommentCommand, RevisionCommentDto>
{
    private readonly IRepository<RevisionComment> _repo;
    private readonly IUnitOfWork _uow;

    public UpdateRevisionCommentHandler(IRepository<RevisionComment> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<RevisionCommentDto> Handle(UpdateRevisionCommentCommand request, CancellationToken ct)
    {
        var comments = await _repo.GetAllAsync(
            r => r.Id == request.Id && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct);
        var comment = comments.FirstOrDefault() ?? throw new KeyNotFoundException("RevisionComment not found");

        if (request.ParagraphIndex.HasValue) comment.ParagraphIndex = request.ParagraphIndex.Value;
        if (request.StartOffset.HasValue) comment.StartOffset = request.StartOffset.Value;
        if (request.EndOffset.HasValue) comment.EndOffset = request.EndOffset.Value;
        if (request.SelectedText is not null) comment.SelectedText = request.SelectedText;
        if (request.Comment is not null) comment.Comment = request.Comment;
        if (request.Resolved.HasValue) comment.Resolved = request.Resolved.Value;
        comment.UpdatedAt = DateTime.UtcNow;

        _repo.Update(comment);
        await _uow.SaveChangesAsync(ct);
        return new RevisionCommentDto(comment.Id, comment.StoryId, comment.ParagraphIndex, comment.StartOffset, comment.EndOffset, comment.SelectedText, comment.Comment, comment.Resolved, comment.CreatedAt);
    }
}
