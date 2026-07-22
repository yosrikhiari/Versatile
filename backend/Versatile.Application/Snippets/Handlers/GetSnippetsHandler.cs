using MediatR;
using Versatile.Application.Snippets.Queries;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snippets.Handlers;

public class GetSnippetsHandler : IRequestHandler<GetSnippetsQuery, List<SnippetDto>>
{
    private readonly IRepository<Snippet> _repo;
    public GetSnippetsHandler(IRepository<Snippet> repo) => _repo = repo;

    public async Task<List<SnippetDto>> Handle(GetSnippetsQuery request, CancellationToken ct)
    {
        var snippets = await _repo.GetAllAsync(
            s => s.StoryId == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        return snippets.OrderByDescending(s => s.Count)
            .Select(s => new SnippetDto(s.Id, s.StoryId, s.Word, s.Count, s.LastSeen))
            .ToList();
    }
}
