using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.VoiceProfiles.Commands;
using Versatile.Domain.Interfaces;
using Story = Versatile.Domain.Entities.Story;
using Entity = Versatile.Domain.Entities.VoiceProfile;

namespace Versatile.Application.VoiceProfiles.Handlers;

public class CreateVoiceProfileHandler : IRequestHandler<CreateVoiceProfileCommand, VoiceProfileDto>
{
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IRepository<Entity> _entities;
    private readonly IUnitOfWork _unitOfWork;

    public CreateVoiceProfileHandler(IOrganizationOwnedRepository<Story> stories, IRepository<Entity> entities, IUnitOfWork unitOfWork)
    {
        _stories = stories;
        _entities = entities;
        _unitOfWork = unitOfWork;
    }

    public async Task<VoiceProfileDto> Handle(CreateVoiceProfileCommand request, CancellationToken ct)
    {
        var story = await _stories.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var entity = new Entity
        {
            StoryId = request.StoryId,
            Name = request.Name,
            Settings = request.Settings,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };

        await _entities.AddAsync(entity, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }

    private static VoiceProfileDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Name, e.Settings, e.CreatedAt, e.UpdatedAt);
}
