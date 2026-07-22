using MediatR;
using Versatile.Application.Snippets.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Snippets.Handlers;

public class DeleteSnippetHandler : IRequestHandler<DeleteSnippetCommand, Unit>
{
    private readonly IRepository<Snippet> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteSnippetHandler(IRepository<Snippet> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteSnippetCommand request, CancellationToken ct)
    {
        var snippets = await _repo.GetAllAsync(
            s => s.Id == request.Id && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct);
        var snippet = snippets.FirstOrDefault() ?? throw new KeyNotFoundException("Snippet not found");

        _repo.Delete(snippet);
        await _uow.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
