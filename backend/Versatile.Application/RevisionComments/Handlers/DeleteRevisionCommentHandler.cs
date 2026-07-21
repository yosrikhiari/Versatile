using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.RevisionComments.Commands;
using Versatile.Domain.Entities;

namespace Versatile.Application.RevisionComments.Handlers;

public class DeleteRevisionCommentHandler : IRequestHandler<DeleteRevisionCommentCommand, Unit>
{
    private readonly DbContext _db;
    public DeleteRevisionCommentHandler(DbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteRevisionCommentCommand request, CancellationToken ct)
    {
        var comment = await _db.Set<RevisionComment>()
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("RevisionComment not found");
        _db.Set<RevisionComment>().Remove(comment);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
