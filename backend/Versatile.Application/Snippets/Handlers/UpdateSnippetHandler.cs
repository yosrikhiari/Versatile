using MediatR;
using Versatile.Application.Snippets.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snippets.Handlers;

public class UpdateSnippetHandler : IRequestHandler<UpdateSnippetCommand, SnippetDto>
{
    private readonly IRepository<Snippet> _repo;
    private readonly IUnitOfWork _uow;

    public UpdateSnippetHandler(IRepository<Snippet> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<SnippetDto> Handle(UpdateSnippetCommand request, CancellationToken ct)
    {
        var snippets = await _repo.GetAllAsync(
            s => s.Id == request.Id && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        var snippet = snippets.FirstOrDefault() ?? throw new KeyNotFoundException("Snippet not found");

        if (request.Word is not null) snippet.Word = request.Word;
        if (request.Count.HasValue) snippet.Count = request.Count.Value;
        if (request.LastSeen.HasValue) snippet.LastSeen = request.LastSeen.Value;
        snippet.UpdatedAt = DateTime.UtcNow;

        _repo.Update(snippet);
        await _uow.SaveChangesAsync(ct);
        return new SnippetDto(snippet.Id, snippet.StoryId, snippet.Word, snippet.Count, snippet.LastSeen);
    }
}
