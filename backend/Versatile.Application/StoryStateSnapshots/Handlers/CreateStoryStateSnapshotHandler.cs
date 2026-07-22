using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.StoryStateSnapshots.Commands;
using Versatile.Domain.Interfaces;
using Story = Versatile.Domain.Entities.Story;
using Entity = Versatile.Domain.Entities.StoryStateSnapshot;

namespace Versatile.Application.StoryStateSnapshots.Handlers;

public class CreateStoryStateSnapshotHandler : IRequestHandler<CreateStoryStateSnapshotCommand, StoryStateSnapshotDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Entity> _entities;
    private readonly IUnitOfWork _unitOfWork;

    public CreateStoryStateSnapshotHandler(IOrganizationOwnedRepository<Story> stories, IRepository<Entity> entities, IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _entities = entities;
        _unitOfWork = unitOfWork;
    }

    public async Task<StoryStateSnapshotDto> Handle(CreateStoryStateSnapshotCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entity = new Entity
        {
            StoryId = request.StoryId,
            Timestamp = request.Timestamp,
            Data = request.Data,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _entities.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }

    private static StoryStateSnapshotDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Timestamp, e.Data);
}
