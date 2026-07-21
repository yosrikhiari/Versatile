using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.RevisionComments.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.RevisionComments.Handlers;

public class GetRevisionCommentByIdHandler : IRequestHandler<GetRevisionCommentByIdQuery, RevisionCommentDto>
{
    private readonly DbContext _db;
    public GetRevisionCommentByIdHandler(DbContext db) => _db = db;

    public async Task<RevisionCommentDto> Handle(GetRevisionCommentByIdQuery request, CancellationToken ct)
    {
        var comment = await _db.Set<RevisionComment>()
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("RevisionComment not found");
        return new RevisionCommentDto(comment.Id, comment.StoryId, comment.ParagraphIndex, comment.StartOffset, comment.EndOffset, comment.SelectedText, comment.Comment, comment.Resolved, comment.CreatedAt);
    }
}
