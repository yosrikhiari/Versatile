using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.StoryElements.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.StoryElements.Handlers;

public class GetStoryElementsHandler : IRequestHandler<GetStoryElementsQuery, List<StoryElementDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<StoryElement> _elements;

    public GetStoryElementsHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<StoryElement> elements)
    {
        _stories = stories;
        _elements = elements;
    }

    public async Task<List<StoryElementDto>> Handle(GetStoryElementsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var elements = await _elements.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return elements.Select(ToDto).ToList();
    }

    private static StoryElementDto ToDto(StoryElement e) => new(
        e.Id, e.StoryId, e.Type, e.Title, e.X, e.Y, e.Width, e.Height, e.Data
    );
}

public class GetStoryElementByIdHandler : IRequestHandler<GetStoryElementByIdQuery, StoryElementDto>
{
    private readonly IRepository<StoryElement> _elements;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetStoryElementByIdHandler(
        IRepository<StoryElement> elements,
        IOrganizationOwnedRepository<Story> stories)
    {
        _elements = elements;
        _stories = stories;
    }

    public async Task<StoryElementDto> Handle(GetStoryElementByIdQuery request, CancellationToken ct)
    {
        var element = await _elements.GetByIdAsync(request.Id, ct);
        if (element is null)
            throw new KeyNotFoundException("StoryElement not found");

        var story = await _stories.GetByIdForOrganizationAsync(element.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("StoryElement not found");

        return ToDto(element);
    }

    private static StoryElementDto ToDto(StoryElement e) => new(
        e.Id, e.StoryId, e.Type, e.Title, e.X, e.Y, e.Width, e.Height, e.Data
    );
}
