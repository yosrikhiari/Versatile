using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Snippets.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Snippets.Handlers;

public class GetSnippetByIdHandler : IRequestHandler<GetSnippetByIdQuery, SnippetDto>
{
    private readonly DbContext _db;
    public GetSnippetByIdHandler(DbContext db) => _db = db;

    public async Task<SnippetDto> Handle(GetSnippetByIdQuery request, CancellationToken ct)
    {
        var snippet = await _db.Set<Snippet>()
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Snippet not found");
        return new SnippetDto(snippet.Id, snippet.StoryId, snippet.Word, snippet.Count, snippet.LastSeen);
    }
}
