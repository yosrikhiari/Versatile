using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GraphGroups.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphGroups.Handlers;

public class GetGraphGroupsHandler : IRequestHandler<GetGraphGroupsQuery, List<GraphGroupDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<GraphGroup> _groups;

    public GetGraphGroupsHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<GraphGroup> groups)
    {
        _stories = stories;
        _groups = groups;
    }

    public async Task<List<GraphGroupDto>> Handle(GetGraphGroupsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entities = await _groups.GetAllAsync(g => g.StoryId == request.StoryId, ct);
        return entities
            .Select(g => new GraphGroupDto(g.Id, g.StoryId, g.Label, g.Color, g.Data))
            .ToList();
    }
}

public class GetGraphGroupByIdHandler : IRequestHandler<GetGraphGroupByIdQuery, GraphGroupDto>
{
    private readonly IRepository<GraphGroup> _groups;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetGraphGroupByIdHandler(
        IRepository<GraphGroup> groups,
        IOrganizationOwnedRepository<Story> stories)
    {
        _groups = groups;
        _stories = stories;
    }

    public async Task<GraphGroupDto> Handle(GetGraphGroupByIdQuery request, CancellationToken ct)
    {
        var entity = await _groups.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GraphGroup not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GraphGroup not found");

        return new GraphGroupDto(entity.Id, entity.StoryId, entity.Label, entity.Color, entity.Data);
    }
}
