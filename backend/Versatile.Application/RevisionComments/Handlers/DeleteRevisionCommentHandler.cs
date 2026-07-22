using MediatR;
using Versatile.Application.RevisionComments.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.RevisionComments.Handlers;

public class DeleteRevisionCommentHandler : IRequestHandler<DeleteRevisionCommentCommand, Unit>
{
    private readonly IRepository<RevisionComment> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteRevisionCommentHandler(IRepository<RevisionComment> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteRevisionCommentCommand request, CancellationToken ct)
    {
        var comments = await _repo.GetAllAsync(
            r => r.Id == request.Id && r.UserId == request.UserId && r.OrganizationId == request.OrganizationId, ct);
        var comment = comments.FirstOrDefault() ?? throw new KeyNotFoundException("RevisionComment not found");

        _repo.Delete(comment);
        await _uow.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
