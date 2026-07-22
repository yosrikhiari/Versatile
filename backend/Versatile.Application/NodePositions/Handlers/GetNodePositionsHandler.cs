using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.NodePositions.Queries;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.NodePositions.Handlers;

public class GetNodePositionsHandler : IRequestHandler<GetNodePositionsQuery, List<NodePositionDto>>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<NodePosition> _nodePositions;

    public GetNodePositionsHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<NodePosition> nodePositions)
    {
        _stories = stories;
        _nodePositions = nodePositions;
    }

    public async Task<List<NodePositionDto>> Handle(GetNodePositionsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var nodePositions = await _nodePositions.GetAllAsync(n => n.StoryId == request.StoryId, ct);
        return nodePositions.Select(ToDto).ToList();
    }

    private static NodePositionDto ToDto(NodePosition n) => new(
        n.Id, n.StoryId, n.NodeId, n.NodeType, n.X, n.Y
    );
}

public class GetNodePositionByIdHandler : IRequestHandler<GetNodePositionByIdQuery, NodePositionDto>
{
    private readonly IRepository<NodePosition> _nodePositions;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetNodePositionByIdHandler(
        IRepository<NodePosition> nodePositions,
        IOrganizationOwnedRepository<Story> stories)
    {
        _nodePositions = nodePositions;
        _stories = stories;
    }

    public async Task<NodePositionDto> Handle(GetNodePositionByIdQuery request, CancellationToken ct)
    {
        var nodePosition = await _nodePositions.GetByIdAsync(request.Id, ct);
        if (nodePosition is null)
            throw new KeyNotFoundException("NodePosition not found");

        var story = await _stories.GetByIdForOrganizationAsync(nodePosition.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("NodePosition not found");

        return ToDto(nodePosition);
    }

    private static NodePositionDto ToDto(NodePosition n) => new(
        n.Id, n.StoryId, n.NodeId, n.NodeType, n.X, n.Y
    );
}
