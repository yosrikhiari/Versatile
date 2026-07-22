using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.StoryStateSnapshots.Commands;
using Versatile.Domain.Interfaces;
using Story = Versatile.Domain.Entities.Story;
using Entity = Versatile.Domain.Entities.StoryStateSnapshot;

namespace Versatile.Application.StoryStateSnapshots.Handlers;

public class UpdateStoryStateSnapshotHandler : IRequestHandler<UpdateStoryStateSnapshotCommand, StoryStateSnapshotDto>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateStoryStateSnapshotHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    {
        _entities = entities;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<StoryStateSnapshotDto> Handle(UpdateStoryStateSnapshotCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("StoryStateSnapshot not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("StoryStateSnapshot not found");

        if (request.Data is not null) entity.Data = request.Data;
        entity.UpdatedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }

    private static StoryStateSnapshotDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Timestamp, e.Data);
}
