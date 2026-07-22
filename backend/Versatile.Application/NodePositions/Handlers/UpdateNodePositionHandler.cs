using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.NodePositions.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.NodePositions.Handlers;

public class UpdateNodePositionHandler : IRequestHandler<UpdateNodePositionCommand, NodePositionDto>
{
    private readonly IRepository<NodePosition> _nodePositions;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateNodePositionHandler(
        IRepository<NodePosition> nodePositions,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _nodePositions = nodePositions;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<NodePositionDto> Handle(UpdateNodePositionCommand request, CancellationToken ct)
    {
        var nodePosition = await _nodePositions.GetByIdAsync(request.Id, ct);
        if (nodePosition is null)
            throw new KeyNotFoundException("NodePosition not found");

        var story = await _stories.GetByIdForOrganizationAsync(nodePosition.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("NodePosition not found");

        if (request.NodeId is not null) nodePosition.NodeId = request.NodeId;
        if (request.NodeType is not null) nodePosition.NodeType = request.NodeType;
        if (request.X.HasValue) nodePosition.X = request.X.Value;
        if (request.Y.HasValue) nodePosition.Y = request.Y.Value;
        nodePosition.UpdatedAt = DateTime.UtcNow;

        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(nodePosition);
    }

    private static NodePositionDto ToDto(NodePosition n) => new(
        n.Id, n.StoryId, n.NodeId, n.NodeType, n.X, n.Y
    );
}
