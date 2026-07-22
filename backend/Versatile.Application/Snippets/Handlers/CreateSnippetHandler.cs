using MediatR;
using Versatile.Application.Snippets.Commands;
using Versatile.Application.DTOs;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snippets.Handlers;

public class CreateSnippetHandler : IRequestHandler<CreateSnippetCommand, SnippetDto>
{
    private readonly IRepository<Snippet> _repo;
    private readonly IRepository<Story> _storyRepo;
    private readonly IUnitOfWork _uow;

    public CreateSnippetHandler(IRepository<Snippet> repo, IRepository<Story> storyRepo, IUnitOfWork uow)
    {
        _repo = repo;
        _storyRepo = storyRepo;
        _uow = uow;
    }

    public async Task<SnippetDto> Handle(CreateSnippetCommand request, CancellationToken ct)
    {
        var stories = await _storyRepo.GetAllAsync(
            s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        if (stories.Count == 0) throw new KeyNotFoundException("Story not found");

        var snippet = new Snippet
        {
            StoryId = request.StoryId,
            Word = request.Word,
            Count = request.Count,
            LastSeen = request.LastSeen ?? DateTime.UtcNow,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };
        await _repo.AddAsync(snippet, ct);
        await _uow.SaveChangesAsync(ct);
        return new SnippetDto(snippet.Id, snippet.StoryId, snippet.Word, snippet.Count, snippet.LastSeen);
    }
}
