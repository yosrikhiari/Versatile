using MediatR;
using Versatile.Application.Snippets.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snippets.Handlers;

public class GetSnippetByIdHandler : IRequestHandler<GetSnippetByIdQuery, SnippetDto>
{
    private readonly IRepository<Snippet> _repo;
    public GetSnippetByIdHandler(IRepository<Snippet> repo) => _repo = repo;

    public async Task<SnippetDto> Handle(GetSnippetByIdQuery request, CancellationToken ct)
    {
        var snippets = await _repo.GetAllAsync(
            s => s.Id == request.Id && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        var snippet = snippets.FirstOrDefault() ?? throw new KeyNotFoundException("Snippet not found");
        return new SnippetDto(snippet.Id, snippet.StoryId, snippet.Word, snippet.Count, snippet.LastSeen);
    }
}
