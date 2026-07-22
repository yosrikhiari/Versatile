using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GroupEdges.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GroupEdges.Handlers;

public class GetGroupEdgesHandler : IRequestHandler<GetGroupEdgesQuery, List<GroupEdgeDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<GroupEdge> _groupEdges;

    public GetGroupEdgesHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<GroupEdge> groupEdges)
    {
        _stories = stories;
        _groupEdges = groupEdges;
    }

    public async Task<List<GroupEdgeDto>> Handle(GetGroupEdgesQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entities = await _groupEdges.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return entities
            .Select(e => new GroupEdgeDto(e.Id, e.StoryId, e.SourceGroupId, e.TargetGroupId, e.RelationshipType))
            .ToList();
    }
}

public class GetGroupEdgeByIdHandler : IRequestHandler<GetGroupEdgeByIdQuery, GroupEdgeDto>
{
    private readonly IRepository<GroupEdge> _groupEdges;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetGroupEdgeByIdHandler(
        IRepository<GroupEdge> groupEdges,
        IOrganizationOwnedRepository<Story> stories)
    {
        _groupEdges = groupEdges;
        _stories = stories;
    }

    public async Task<GroupEdgeDto> Handle(GetGroupEdgeByIdQuery request, CancellationToken ct)
    {
        var entity = await _groupEdges.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GroupEdge not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GroupEdge not found");

        return new GroupEdgeDto(entity.Id, entity.StoryId, entity.SourceGroupId, entity.TargetGroupId, entity.RelationshipType);
    }
}
