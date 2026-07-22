using MediatR;
using Versatile.Application.StoryStateSnapshots.Commands;
using Versatile.Domain.Interfaces;
using Story = Versatile.Domain.Entities.Story;
using Entity = Versatile.Domain.Entities.StoryStateSnapshot;

namespace Versatile.Application.StoryStateSnapshots.Handlers;

public class DeleteStoryStateSnapshotHandler : IRequestHandler<DeleteStoryStateSnapshotCommand, Unit>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteStoryStateSnapshotHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    {
        _entities = entities;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(DeleteStoryStateSnapshotCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("StoryStateSnapshot not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("StoryStateSnapshot not found");

        _entities.Delete(entity);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
