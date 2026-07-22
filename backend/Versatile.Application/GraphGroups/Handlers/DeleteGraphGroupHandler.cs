using MediatR;
using Versatile.Application.GraphGroups.Commands;
using Versatile.Domain.Entities;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.GraphGroups.Handlers;

public class DeleteGraphGroupHandler : IRequestHandler<DeleteGraphGroupCommand, Unit>
{
    private readonly IRepository<GraphGroup> _groups;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteGraphGroupHandler(
        IRepository<GraphGroup> groups,
        IOrganizationOwnedRepository<Story> stories,
        IUnitOfWork unitOfWork)
    {
        _groups = groups;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteGraphGroupCommand request, CancellationToken ct)
    {
        var entity = await _groups.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("GraphGroup not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("GraphGroup not found");

        _groups.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
