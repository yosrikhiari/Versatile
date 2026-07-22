using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.NodePositions.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.NodePositions.Handlers;

public class CreateNodePositionHandler : IRequestHandler<CreateNodePositionCommand, NodePositionDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<NodePosition> _nodePositions;
    private readonly IUnitOfWork _unitOfWork;

    public CreateNodePositionHandler(
        IOrganizationOwnedRepository<Story> stories,
        IRepository<NodePosition> nodePositions,
        IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _nodePositions = nodePositions;
        _unitOfWork = unitOfWork;
    }

    public async Task<NodePositionDto> Handle(CreateNodePositionCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var nodePosition = new NodePosition
        {
            StoryId = request.StoryId,
            NodeId = request.NodeId,
            NodeType = request.NodeType,
            X = request.X,
            Y = request.Y,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _nodePositions.AddAsync(nodePosition, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(nodePosition);
    }

    private static NodePositionDto ToDto(NodePosition n) => new(
        n.Id, n.StoryId, n.NodeId, n.NodeType, n.X, n.Y
    );
}
