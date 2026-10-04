using MediatR;
using Versatile.Application.Branches.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Branches.Handlers;

public class DeleteBranchHandler : IRequestHandler<DeleteBranchCommand, Unit>
{
    private readonly IRepository<Branch> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteBranchHandler(IRepository<Branch> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteBranchCommand request, CancellationToken ct)
    {
        var branch = await BranchMapping.OwnedAsync(_repo, request.Id, request.UserId, request.OrganizationId, ct);
        _repo.Delete(branch);
        await _uow.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
