using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Volume.Commands;
using Versatile.Domain.Interfaces;
using VolumeEntity = Versatile.Domain.Entities.Volume;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Volume.Handlers;

public class UpdateVolumeHandler : IRequestHandler<UpdateVolumeCommand, VolumeDto>
{
    private readonly IRepository<VolumeEntity> _volumeRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateVolumeHandler(IRepository<VolumeEntity> volumeRepo, IOrganizationOwnedRepository<Story> storyRepo, IUnitOfWork unitOfWork)
    {
        _volumeRepo = volumeRepo;
        _storyRepo = storyRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<VolumeDto> Handle(UpdateVolumeCommand request, CancellationToken ct)
    {
        var volume = await _volumeRepo.GetByIdAsync(request.Id, ct);
        if (volume is null)
            throw new KeyNotFoundException("Volume not found");

        var story = await _storyRepo.GetByIdForOrganizationAsync(volume.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Volume not found");

        if (request.Title is not null) volume.Title = request.Title;
        if (request.Description is not null) volume.Description = request.Description;
        if (request.Color is not null) volume.Color = request.Color;
        if (request.SortOrder.HasValue) volume.SortOrder = request.SortOrder.Value;
        if (request.ChapterIds is not null) volume.ChapterIds = request.ChapterIds;
        volume.UpdatedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(volume);
    }

    private static VolumeDto ToDto(VolumeEntity v) => new(v.Id, v.StoryId, v.Title, v.Description, v.Color, v.SortOrder, v.ChapterIds, v.CreatedAt, v.UpdatedAt);
}
