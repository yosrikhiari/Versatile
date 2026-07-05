using MediatR;
using Versatile.Application.Stories.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.Stories.Handlers;

public class DeleteStoryHandler : IRequestHandler<DeleteStoryCommand, Unit>
{
    private readonly IUserOwnedRepository<Story> _repo;
    private readonly IUnitOfWork _uow;

    public DeleteStoryHandler(IUserOwnedRepository<Story> repo, IUnitOfWork uow)
    {
        _repo = repo;
        _uow = uow;
    }

    public async Task<Unit> Handle(DeleteStoryCommand request, CancellationToken ct)
    {
        var story = await _repo.GetByIdForUserAsync(request.Id, request.UserId, ct)
            ?? throw new KeyNotFoundException("Story not found");

        _repo.Delete(story);
        await _uow.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
