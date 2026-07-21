using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Snippets.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Snippets.Handlers;

public class UpdateSnippetHandler : IRequestHandler<UpdateSnippetCommand, SnippetDto>
{
    private readonly DbContext _db;
    public UpdateSnippetHandler(DbContext db) => _db = db;

    public async Task<SnippetDto> Handle(UpdateSnippetCommand request, CancellationToken ct)
    {
        var snippet = await _db.Set<Snippet>()
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Snippet not found");
        if (request.Word is not null) snippet.Word = request.Word;
        if (request.Count.HasValue) snippet.Count = request.Count.Value;
        if (request.LastSeen.HasValue) snippet.LastSeen = request.LastSeen.Value;
        snippet.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return new SnippetDto(snippet.Id, snippet.StoryId, snippet.Word, snippet.Count, snippet.LastSeen);
    }
}
