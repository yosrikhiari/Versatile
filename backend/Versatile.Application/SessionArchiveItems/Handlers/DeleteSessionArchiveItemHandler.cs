using MediatR;
using Versatile.Application.SessionArchiveItems.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SessionArchiveItems.Handlers;

public class DeleteSessionArchiveItemHandler : IRequestHandler<DeleteSessionArchiveItemCommand, Unit>
{
    private readonly IRepository<SessionArchiveItem> _items;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSessionArchiveItemHandler(
        IRepository<SessionArchiveItem> items,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _items = items;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteSessionArchiveItemCommand request, CancellationToken ct)
    {
        var item = await _items.GetByIdAsync(request.Id, ct);
        if (item is null)
            throw new KeyNotFoundException("Session archive item not found");

        var story = await _stories.GetByIdForOrganizationAsync(item.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Session archive item not found");

        _items.Delete(item);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
