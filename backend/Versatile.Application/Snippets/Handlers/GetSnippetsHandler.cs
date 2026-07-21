using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Snippets.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Snippets.Handlers;

public class GetSnippetsHandler : IRequestHandler<GetSnippetsQuery, List<SnippetDto>>
{
    private readonly DbContext _db;
    public GetSnippetsHandler(DbContext db) => _db = db;

    public async Task<List<SnippetDto>> Handle(GetSnippetsQuery request, CancellationToken ct) =>
        await _db.Set<Snippet>()
            .Where(s => s.StoryId == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId)
            .OrderByDescending(s => s.Count)
            .Select(s => new SnippetDto(s.Id, s.StoryId, s.Word, s.Count, s.LastSeen))
            .ToListAsync(ct);
}
