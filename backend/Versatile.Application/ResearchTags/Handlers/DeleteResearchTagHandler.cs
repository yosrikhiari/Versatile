using MediatR;
using Versatile.Application.ResearchTags.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.ResearchTags.Handlers;

public class DeleteResearchTagHandler : IRequestHandler<DeleteResearchTagCommand, Unit>
{
    private readonly IRepository<ResearchTag> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteResearchTagHandler(IRepository<ResearchTag> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteResearchTagCommand request, CancellationToken ct)
    {
        var tags = await _repo.GetAllAsync(
            t => t.Id == request.Id && t.UserId == request.UserId, ct);
        var tag = tags.FirstOrDefault() ?? throw new KeyNotFoundException("Research tag not found");

        _repo.Delete(tag);
        await _uow.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
