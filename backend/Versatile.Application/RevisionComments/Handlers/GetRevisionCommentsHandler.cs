using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.RevisionComments.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.RevisionComments.Handlers;

public class GetRevisionCommentsHandler : IRequestHandler<GetRevisionCommentsQuery, List<RevisionCommentDto>>
{
    private readonly DbContext _db;
    public GetRevisionCommentsHandler(DbContext db) => _db = db;

    public async Task<List<RevisionCommentDto>> Handle(GetRevisionCommentsQuery request, CancellationToken ct) =>
        await _db.Set<RevisionComment>()
            .Where(r => r.StoryId == request.StoryId && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new RevisionCommentDto(r.Id, r.StoryId, r.ParagraphIndex, r.StartOffset, r.EndOffset, r.SelectedText, r.Comment, r.Resolved, r.CreatedAt))
            .ToListAsync(ct);
}
