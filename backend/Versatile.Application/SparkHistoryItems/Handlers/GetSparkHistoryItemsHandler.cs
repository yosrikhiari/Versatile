using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.SparkHistoryItems.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SparkHistoryItems.Handlers;

public class GetSparkHistoryItemsHandler : IRequestHandler<GetSparkHistoryItemsQuery, List<SparkHistoryItemDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<SparkHistoryItem> _items;

    public GetSparkHistoryItemsHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<SparkHistoryItem> items)
    {
        _stories = stories;
        _items = items;
    }

    public async Task<List<SparkHistoryItemDto>> Handle(GetSparkHistoryItemsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var items = await _items.GetAllAsync(i => i.StoryId == request.StoryId, ct);
        return items
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new SparkHistoryItemDto(i.Id, i.StoryId, i.Type, i.Prompt, i.Blueprint, i.GeneratedContent, i.CreatedAt))
            .ToList();
    }
}

public class GetSparkHistoryItemByIdHandler : IRequestHandler<GetSparkHistoryItemByIdQuery, SparkHistoryItemDto>
{
    private readonly IRepository<SparkHistoryItem> _items;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetSparkHistoryItemByIdHandler(
        IRepository<SparkHistoryItem> items,
        IOrganizationOwnedRepository<Story> stories)
    {
        _items = items;
        _stories = stories;
    }

    public async Task<SparkHistoryItemDto> Handle(GetSparkHistoryItemByIdQuery request, CancellationToken ct)
    {
        var item = await _items.GetByIdAsync(request.Id, ct);
        if (item is null)
            throw new KeyNotFoundException("Spark history item not found");

        var story = await _stories.GetByIdForOrganizationAsync(item.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Spark history item not found");

        return new SparkHistoryItemDto(item.Id, item.StoryId, item.Type, item.Prompt, item.Blueprint, item.GeneratedContent, item.CreatedAt);
    }
}
