using MediatR;
using Versatile.Application.RevisionComments.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.RevisionComments.Handlers;

public class GetRevisionCommentsHandler : IRequestHandler<GetRevisionCommentsQuery, List<RevisionCommentDto>>
{
    private readonly IRepository<RevisionComment> _repo;
    public GetRevisionCommentsHandler(IRepository<RevisionComment> repo) => _repo = repo;

    public async Task<List<RevisionCommentDto>> Handle(GetRevisionCommentsQuery request, CancellationToken ct)
    {
        var comments = await _repo.GetAllAsync(
            r => r.StoryId == request.StoryId && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct);
        return comments.OrderByDescending(r => r.CreatedAt)
            .Select(r => new RevisionCommentDto(r.Id, r.StoryId, r.ParagraphIndex, r.StartOffset, r.EndOffset, r.SelectedText, r.Comment, r.Resolved, r.CreatedAt))
            .ToList();
    }
}
