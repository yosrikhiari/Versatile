using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.RevisionComments.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.RevisionComments.Handlers;

public class CreateRevisionCommentHandler : IRequestHandler<CreateRevisionCommentCommand, RevisionCommentDto>
{
    private readonly DbContext _db;
    public CreateRevisionCommentHandler(DbContext db) => _db = db;

    public async Task<RevisionCommentDto> Handle(CreateRevisionCommentCommand request, CancellationToken ct)
    {
        var storyExists = await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        if (!storyExists) throw new KeyNotFoundException("Story not found");

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
        _db.Set<RevisionComment>().Add(comment);
        await _db.SaveChangesAsync(ct);
        return new RevisionCommentDto(comment.Id, comment.StoryId, comment.ParagraphIndex, comment.StartOffset, comment.EndOffset, comment.SelectedText, comment.Comment, comment.Resolved, comment.CreatedAt);
    }
}
