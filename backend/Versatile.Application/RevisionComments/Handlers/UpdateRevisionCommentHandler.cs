using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.RevisionComments.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.RevisionComments.Handlers;

public class UpdateRevisionCommentHandler : IRequestHandler<UpdateRevisionCommentCommand, RevisionCommentDto>
{
    private readonly DbContext _db;
    public UpdateRevisionCommentHandler(DbContext db) => _db = db;

    public async Task<RevisionCommentDto> Handle(UpdateRevisionCommentCommand request, CancellationToken ct)
    {
        var comment = await _db.Set<RevisionComment>()
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("RevisionComment not found");
        if (request.ParagraphIndex.HasValue) comment.ParagraphIndex = request.ParagraphIndex.Value;
        if (request.StartOffset.HasValue) comment.StartOffset = request.StartOffset.Value;
        if (request.EndOffset.HasValue) comment.EndOffset = request.EndOffset.Value;
        if (request.SelectedText is not null) comment.SelectedText = request.SelectedText;
        if (request.Comment is not null) comment.Comment = request.Comment;
        if (request.Resolved.HasValue) comment.Resolved = request.Resolved.Value;
        comment.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return new RevisionCommentDto(comment.Id, comment.StoryId, comment.ParagraphIndex, comment.StartOffset, comment.EndOffset, comment.SelectedText, comment.Comment, comment.Resolved, comment.CreatedAt);
    }
}
