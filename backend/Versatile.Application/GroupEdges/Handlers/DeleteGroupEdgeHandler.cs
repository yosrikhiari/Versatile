using MediatR;
using Versatile.Application.GroupEdges.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GroupEdges.Handlers;

public class DeleteGroupEdgeHandler : IRequestHandler<DeleteGroupEdgeCommand, Unit>
{
    private readonly IRepository<GroupEdge> _groupEdges;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteGroupEdgeHandler(
        IRepository<GroupEdge> groupEdges,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _groupEdges = groupEdges;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteGroupEdgeCommand request, CancellationToken ct)
    {
        var entity = await _groupEdges.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GroupEdge not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GroupEdge not found");

        _groupEdges.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
