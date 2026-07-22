using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.VoiceProfiles.Queries;
using Versatile.Domain.Interfaces;
using Story = Versatile.Domain.Entities.Story;
using Entity = Versatile.Domain.Entities.VoiceProfile;

namespace Versatile.Application.VoiceProfiles.Handlers;

public class GetVoiceProfilesHandler : IRequestHandler<GetVoiceProfilesQuery, List<VoiceProfileDto>>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetVoiceProfilesHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories)
    {
        _entities = entities;
        _stories = stories;
    }

    public async Task<List<VoiceProfileDto>> Handle(GetVoiceProfilesQuery request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entities = await _entities.GetAllAsync(e => e.StoryId == request.StoryId, ct);
        return entities.Select(ToDto).ToList();
    }

    private static VoiceProfileDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Name, e.Settings, e.CreatedAt, e.UpdatedAt);
}

public class GetVoiceProfileByIdHandler : IRequestHandler<GetVoiceProfileByIdQuery, VoiceProfileDto>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;

    public GetVoiceProfileByIdHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories)
    {
        _entities = entities;
        _stories = stories;
    }

    public async Task<VoiceProfileDto> Handle(GetVoiceProfileByIdQuery request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("VoiceProfile not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("VoiceProfile not found");

        return ToDto(entity);
    }

    private static VoiceProfileDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Name, e.Settings, e.CreatedAt, e.UpdatedAt);
}
