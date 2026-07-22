using MediatR;
using Versatile.Application.GraphEdges.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphEdges.Handlers;

public class DeleteGraphEdgeHandler : IRequestHandler<DeleteGraphEdgeCommand, Unit>
{
    private readonly IRepository<GraphEdge> _edges;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteGraphEdgeHandler(
        IRepository<GraphEdge> edges,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _edges = edges;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteGraphEdgeCommand request, CancellationToken ct)
    {
        var entity = await _edges.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GraphEdge not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GraphEdge not found");

        _edges.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
