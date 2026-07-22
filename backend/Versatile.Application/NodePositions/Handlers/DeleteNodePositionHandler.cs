using MediatR;
using Versatile.Application.NodePositions.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.NodePositions.Handlers;

public class DeleteNodePositionHandler : IRequestHandler<DeleteNodePositionCommand, Unit>
{
    private readonly IRepository<NodePosition> _nodePositions;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteNodePositionHandler(
        IRepository<NodePosition> nodePositions,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _nodePositions = nodePositions;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteNodePositionCommand request, CancellationToken ct)
    {
        var nodePosition = await _nodePositions.GetByIdAsync(request.Id, ct);
        if (nodePosition is null)
            throw new KeyNotFoundException("NodePosition not found");

        var story = await _stories.GetByIdForOrganizationAsync(nodePosition.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("NodePosition not found");

        _nodePositions.Delete(nodePosition);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
