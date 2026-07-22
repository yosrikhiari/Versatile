using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.SparkHistoryItems.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SparkHistoryItems.Handlers;

public class UpdateSparkHistoryItemHandler : IRequestHandler<UpdateSparkHistoryItemCommand, SparkHistoryItemDto>
{
    private readonly IRepository<SparkHistoryItem> _items;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSparkHistoryItemHandler(
        IRepository<SparkHistoryItem> items,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _items = items;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<SparkHistoryItemDto> Handle(UpdateSparkHistoryItemCommand request, CancellationToken ct)
    {
        var item = await _items.GetByIdAsync(request.Id, ct);
        if (item is null)
            throw new KeyNotFoundException("Spark history item not found");

        var story = await _stories.GetByIdForOrganizationAsync(item.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Spark history item not found");

        if (request.Type is not null) item.Type = request.Type;
        if (request.Prompt is not null) item.Prompt = request.Prompt;
        if (request.Blueprint is not null) item.Blueprint = request.Blueprint;
        if (request.GeneratedContent is not null) item.GeneratedContent = request.GeneratedContent;
        item.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(item);
    }

    private static SparkHistoryItemDto ToDto(SparkHistoryItem i) => new(
        i.Id, i.StoryId, i.Type, i.Prompt, i.Blueprint, i.GeneratedContent, i.CreatedAt
    );
}
