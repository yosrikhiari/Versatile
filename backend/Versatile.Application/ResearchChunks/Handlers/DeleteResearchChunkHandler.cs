using MediatR;
using Versatile.Application.ResearchChunks.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchChunks.Handlers;

public class DeleteResearchChunkHandler : IRequestHandler<DeleteResearchChunkCommand, Unit>
{
    private readonly IRepository<ResearchChunk> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteResearchChunkHandler(IRepository<ResearchChunk> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteResearchChunkCommand request, CancellationToken ct)
    {
        var chunks = await _repo.GetAllAsync(
            c => c.Id == request.Id && c.UserId == request.UserId, ct);
        var chunk = chunks.FirstOrDefault() ?? throw new KeyNotFoundException("Research chunk not found");

        _repo.Delete(chunk);
        await _uow.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
