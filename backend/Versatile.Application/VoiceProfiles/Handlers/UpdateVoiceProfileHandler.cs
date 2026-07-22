using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.VoiceProfiles.Commands;
using Versatile.Domain.Interfaces;
using Story = Versatile.Domain.Entities.Story;
using Entity = Versatile.Domain.Entities.VoiceProfile;

namespace Versatile.Application.VoiceProfiles.Handlers;

public class UpdateVoiceProfileHandler : IRequestHandler<UpdateVoiceProfileCommand, VoiceProfileDto>
{
    private readonly IRepository<Entity> _entities;
    private readonly IOrganizationOwnedRepository<Story> _stories;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateVoiceProfileHandler(IRepository<Entity> entities, IOrganizationOwnedRepository<Story> stories, IUnitOfWork unitOfWork)
    {
        _entities = entities;
        _stories = stories;
        _unitOfWork = unitOfWork;
    }

    public async Task<VoiceProfileDto> Handle(UpdateVoiceProfileCommand request, CancellationToken ct)
    {
        var entity = await _entities.GetByIdAsync(request.Id, ct);
        if (entity is null)
            throw new KeyNotFoundException("VoiceProfile not found");

        var story = await _stories.GetByIdForOrganizationAsync(entity.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("VoiceProfile not found");

        if (request.Name is not null) entity.Name = request.Name;
        if (request.Settings is not null) entity.Settings = request.Settings;
        entity.UpdatedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(entity);
    }

    private static VoiceProfileDto ToDto(Entity e) => new(e.Id, e.StoryId, e.Name, e.Settings, e.CreatedAt, e.UpdatedAt);
}
