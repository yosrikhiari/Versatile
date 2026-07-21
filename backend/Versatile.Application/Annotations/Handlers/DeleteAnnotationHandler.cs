using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.Annotations.Commands;
using Versatile.Domain.Entities;

namespace Versatile.Application.Annotations.Handlers;

public class DeleteAnnotationHandler : IRequestHandler<DeleteAnnotationCommand, Unit>
{
    private readonly DbContext _db;
    public DeleteAnnotationHandler(DbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteAnnotationCommand request, CancellationToken ct)
    {
        var annotation = await _db.Set<Annotation>()
            .FirstOrDefaultAsync(a => a.Id == request.Id && a.UserId == request.UserId && a.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Annotation not found");
        _db.Set<Annotation>().Remove(annotation);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
