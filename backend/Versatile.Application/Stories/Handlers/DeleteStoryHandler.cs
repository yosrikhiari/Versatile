using MediatR;
using Versatile.Application.Stories.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Handlers;

public class DeleteStoryHandler : IRequestHandler<DeleteStoryCommand, Unit>
{
    private readonly IOrganizationOwnedRepository<Story> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteStoryHandler(IOrganizationOwnedRepository<Story> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteStoryCommand request, CancellationToken ct)
    {
        var story = request.OrganizationId.HasValue
            ? await _repo.GetByIdForOrganizationAsync(request.Id, request.OrganizationId.Value, ct)
            : await _repo.GetByIdForUserAsync(request.Id, request.UserId, ct);

        if (story is null) throw new KeyNotFoundException("Story not found");

        _repo.Delete(story);
        await _uow.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
