using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Snippets.Commands;
using Versatile.Domain.Entities;

namespace Versatile.Application.Snippets.Handlers;

public class DeleteSnippetHandler : IRequestHandler<DeleteSnippetCommand, Unit>
{
    private readonly DbContext _db;
    public DeleteSnippetHandler(DbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteSnippetCommand request, CancellationToken ct)
    {
        var snippet = await _db.Set<Snippet>()
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Snippet not found");
        _db.Set<Snippet>().Remove(snippet);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
