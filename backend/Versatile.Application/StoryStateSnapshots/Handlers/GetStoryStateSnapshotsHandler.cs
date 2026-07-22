using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.StoryStateSnapshots.Queries;
using Versatile.Domain.Interfaces;
using Story = Versatile.Domain.Entities.Story;
using Entity = Versatile.Domain.Entities.StoryStateSnapshot;

namespace Versatile.Application.StoryStateSnapshots.Handlers;

public class GetStoryStateSnapshotsHandler : IRequestHandler<GetStoryStateSnapshotsQuery, List<StoryStateSnapshotDto>>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetStoryStateSnapshotsHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories)
    {
        _entities = entities;
        _stories = stories;
    }

    public async Task<List<StoryStateSnapshotDto>> Handle(GetStoryStateSnapshotsQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entities = await _entities.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return entities.Select(ToDto).ToList();
    }

    private static StoryStateSnapshotDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Timestamp, e.Data);
}

public class GetStoryStateSnapshotByIdHandler : IRequestHandler<GetStoryStateSnapshotByIdQuery, StoryStateSnapshotDto>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetStoryStateSnapshotByIdHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories)
    {
        _entities = entities;
        _stories = stories;
    }

    public async Task<StoryStateSnapshotDto> Handle(GetStoryStateSnapshotByIdQuery request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("StoryStateSnapshot not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("StoryStateSnapshot not found");

        return ToDto(entity);
    }

    private static StoryStateSnapshotDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Timestamp, e.Data);
}
