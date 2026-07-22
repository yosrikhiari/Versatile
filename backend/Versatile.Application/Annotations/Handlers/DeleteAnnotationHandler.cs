using MediatR;
using Versatile.Application.Annotations.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Annotations.Handlers;

public class DeleteAnnotationHandler : IRequestHandler<DeleteAnnotationCommand, Unit>
{
    private readonly IRepository<Annotation> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteAnnotationHandler(IRepository<Annotation> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteAnnotationCommand request, CancellationToken ct)
    {
        var annotations = await _repo.GetAllAsync(
            a => a.Id == request.Id && a.UserId == request.UserId && a.OrganizationId == request.OrganizationId, ct);
        var annotation = annotations.FirstOrDefault() ?? throw new KeyNotFoundException("Annotation not found");
        _repo.Delete(annotation);
        await _uow.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
