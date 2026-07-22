using MediatR;
using Versatile.Application.Research.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;
using ResearchEntity = Versatile.Domain.Entities.Research;

namespace Versatile.Application.Research.Handlers;

public class DeleteResearchNoteHandler : IRequestHandler<DeleteResearchNoteCommand, Unit>
{
    private readonly IRepository<ResearchEntity> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteResearchNoteHandler(IRepository<ResearchEntity> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteResearchNoteCommand request, CancellationToken ct)
    {
        var notes = await _repo.GetAllAsync(
            r => r.Id == request.Id && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct);
        var note = notes.FirstOrDefault() ?? throw new KeyNotFoundException("Research note not found");

        _repo.Delete(note);
        await _uow.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
