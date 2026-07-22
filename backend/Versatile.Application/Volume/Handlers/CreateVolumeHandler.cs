using MediatR;
using Versatile.Application.DTOs;
using Versatile.Application.Volume.Commands;
using Versatile.Domain.Interfaces;
using VolumeEntity = Versatile.Domain.Entities.Volume;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Volume.Handlers;

public class CreateVolumeHandler : IRequestHandler<CreateVolumeCommand, VolumeDto>
{
    private readonly IRepository<VolumeEntity> _volumeRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;
    private readonly IUnitOfWork _unitOfWork;

    public CreateVolumeHandler(IRepository<VolumeEntity> volumeRepo, IOrganizationOwnedRepository<Story> storyRepo, IUnitOfWork unitOfWork)
    {
        _volumeRepo = volumeRepo;
        _storyRepo = storyRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<VolumeDto> Handle(CreateVolumeCommand request, CancellationToken ct)
    {
        var story = await _storyRepo.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var all = await _volumeRepo.GetAllAsync(v => v.StoryId == request.StoryId);
        var maxOrder = all.Any() ? all.Max(v => v.SortOrder) : 0;

        var volume = new VolumeEntity
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Description = request.Description,
            Color = request.Color ?? string.Empty,
            SortOrder = request.SortOrder ?? maxOrder + 1,
            ChapterIds = request.ChapterIds,
            UserId = request.UserId,
            OrganizationId = request.OrganizationId
        };
        await _volumeRepo.AddAsync(volume);
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(volume);
    }

    private static VolumeDto ToDto(VolumeEntity v) => new(v.Id, v.StoryId, v.Title, v.Description, v.Color, v.SortOrder, v.ChapterIds, v.CreatedAt, v.UpdatedAt);
}
