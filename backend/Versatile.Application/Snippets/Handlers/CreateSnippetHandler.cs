using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Snippets.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;

namespace Versatile.Application.Snippets.Handlers;

public class CreateSnippetHandler : IRequestHandler<CreateSnippetCommand, SnippetDto>
{
    private readonly DbContext _db;
    public CreateSnippetHandler(DbContext db) => _db = db;

    public async Task<SnippetDto> Handle(CreateSnippetCommand request, CancellationToken ct)
    {
        var storyExists = await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        if (!storyExists) throw new KeyNotFoundException("Story not found");

        var snippet = new Snippet
        {
            StoryId = request.StoryId,
            Word = request.Word,
            Count = request.Count,
            LastSeen = request.LastSeen ?? DateTime.UtcNow,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };
        _db.Set<Snippet>().Add(snippet);
        await _db.SaveChangesAsync(ct);
        return new SnippetDto(snippet.Id, snippet.StoryId, snippet.Word, snippet.Count, snippet.LastSeen);
    }
}
