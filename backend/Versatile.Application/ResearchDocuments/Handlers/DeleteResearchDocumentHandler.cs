using MediatR;
using Versatile.Application.ResearchDocuments.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchDocuments.Handlers;

public class DeleteResearchDocumentHandler : IRequestHandler<DeleteResearchDocumentCommand, Unit>
{
    private readonly IRepository<ResearchDocument> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteResearchDocumentHandler(IRepository<ResearchDocument> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteResearchDocumentCommand request, CancellationToken ct)
    {
        var docs = await _repo.GetAllAsync(
            d => d.Id == request.Id && d.UserId == request.UserId, ct);
        var doc = docs.FirstOrDefault() ?? throw new KeyNotFoundException("Research document not found");

        _repo.Delete(doc);
        await _uow.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
