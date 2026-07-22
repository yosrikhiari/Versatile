using MediatR;
using Versatile.Application.SparkHistoryItems.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SparkHistoryItems.Handlers;

public class DeleteSparkHistoryItemHandler : IRequestHandler<DeleteSparkHistoryItemCommand, Unit>
{
    private readonly IRepository<SparkHistoryItem> _items;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSparkHistoryItemHandler(
        IRepository<SparkHistoryItem> items,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _items = items;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteSparkHistoryItemCommand request, CancellationToken ct)
    {
        var item = await _items.GetByIdAsync(request.Id, ct);
        if (item is null)
            throw new KeyNotFoundException("Spark history item not found");

        var story = await _stories.GetByIdForOrganizationAsync(item.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Spark history item not found");

        _items.Delete(item);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
