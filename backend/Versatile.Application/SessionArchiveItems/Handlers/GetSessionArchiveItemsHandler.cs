using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.SessionArchiveItems.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SessionArchiveItems.Handlers;

public class GetSessionArchiveItemsHandler : IRequestHandler<GetSessionArchiveItemsQuery, List<SessionArchiveItemDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<SessionArchiveItem> _items;

    public GetSessionArchiveItemsHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<SessionArchiveItem> items)
    {
        _stories = stories;
        _items = items;
    }

    public async Task<List<SessionArchiveItemDto>> Handle(GetSessionArchiveItemsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var items = await _items.GetAllAsync(i => i.StoryId == request.StoryId, ct);
        return items
            .OrderBy(i => i.Timestamp)
            .Select(i => new SessionArchiveItemDto(i.Id, i.StoryId, i.Signal, i.Type, i.Timestamp, i.Data))
            .ToList();
    }
}

public class GetSessionArchiveItemByIdHandler : IRequestHandler<GetSessionArchiveItemByIdQuery, SessionArchiveItemDto>
{
    private readonly IRepository<SessionArchiveItem> _items;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetSessionArchiveItemByIdHandler(
        IRepository<SessionArchiveItem> items,
        IOrganizationOwnedRepository<Story> stories)
    {
        _items = items;
        _stories = stories;
    }

    public async Task<SessionArchiveItemDto> Handle(GetSessionArchiveItemByIdQuery request, CancellationToken ct)
    {
        var item = await _items.GetByIdAsync(request.Id, ct);
        if (item is null)
            throw new KeyNotFoundException("Session archive item not found");

        var story = await _stories.GetByIdForOrganizationAsync(item.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Session archive item not found");

        return new SessionArchiveItemDto(item.Id, item.StoryId, item.Signal, item.Type, item.Timestamp, item.Data);
    }
}
