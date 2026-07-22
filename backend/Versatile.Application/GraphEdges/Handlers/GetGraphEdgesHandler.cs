using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.GraphEdges.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphEdges.Handlers;

public class GetGraphEdgesHandler : IRequestHandler<GetGraphEdgesQuery, List<GraphEdgeDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<GraphEdge> _edges;

    public GetGraphEdgesHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<GraphEdge> edges)
    {
        _stories = stories;
        _edges = edges;
    }

    public async Task<List<GraphEdgeDto>> Handle(GetGraphEdgesQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entities = await _edges.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return entities
            .Select(e => new GraphEdgeDto(e.Id, e.StoryId, e.SourceId, e.TargetId, e.SourceType, e.TargetType, e.RelationshipType, e.Label, e.VolumeId))
            .ToList();
    }
}

public class GetGraphEdgeByIdHandler : IRequestHandler<GetGraphEdgeByIdQuery, GraphEdgeDto>
{
    private readonly IRepository<GraphEdge> _edges;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetGraphEdgeByIdHandler(
        IRepository<GraphEdge> edges,
        IOrganizationOwnedRepository<Story> stories)
    {
        _edges = edges;
        _stories = stories;
    }

    public async Task<GraphEdgeDto> Handle(GetGraphEdgeByIdQuery request, CancellationToken ct)
    {
        var entity = await _edges.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GraphEdge not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GraphEdge not found");

        return new GraphEdgeDto(entity.Id, entity.StoryId, entity.SourceId, entity.TargetId, entity.SourceType, entity.TargetType, entity.RelationshipType, entity.Label, entity.VolumeId);
    }
}
