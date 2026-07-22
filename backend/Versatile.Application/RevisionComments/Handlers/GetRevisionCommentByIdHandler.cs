using MediatR;
using Versatile.Application.RevisionComments.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.RevisionComments.Handlers;

public class GetRevisionCommentByIdHandler : IRequestHandler<GetRevisionCommentByIdQuery, RevisionCommentDto>
{
    private readonly IRepository<RevisionComment> _repo;
    public GetRevisionCommentByIdHandler(IRepository<RevisionComment> repo) => _repo = repo;

    public async Task<RevisionCommentDto> Handle(GetRevisionCommentByIdQuery request, CancellationToken ct)
    {
        var comments = await _repo.GetAllAsync(
            r => r.Id == request.Id && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct);
        var comment = comments.FirstOrDefault() ?? throw new KeyNotFoundException("RevisionComment not found");
        return new RevisionCommentDto(comment.Id, comment.StoryId, comment.ParagraphIndex, comment.StartOffset, comment.EndOffset, comment.SelectedText, comment.Comment, comment.Resolved, comment.CreatedAt);
    }
}
