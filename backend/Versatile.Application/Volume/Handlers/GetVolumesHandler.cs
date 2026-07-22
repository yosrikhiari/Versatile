using MediatR;
using Versatile.Application.Common;
using Versatile.Application.DTOs;
using Versatile.Application.Volume.Queries;
using Versatile.Domain.Interfaces;
using VolumeEntity = Versatile.Domain.Entities.Volume;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Volume.Handlers;

public class GetVolumesHandler : IRequestHandler<GetVolumesQuery, PagedResponse<VolumeDto>>
{
    private readonly IRepository<VolumeEntity> _volumeRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;

    public GetVolumesHandler(IRepository<VolumeEntity> volumeRepo, IOrganizationOwnedRepository<Story> storyRepo)
    {
        _volumeRepo = volumeRepo;
        _storyRepo = storyRepo;
    }

    public async Task<PagedResponse<VolumeDto>> Handle(GetVolumesQuery request, CancellationToken ct)
    {
        var story = await _storyRepo.GetByIdForOrganizationAsync(request.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Story not found");

        var (volumes, totalCount) = await _volumeRepo.GetPagedAsync(v => v.StoryId == request.StoryId, request.Page, request.PageSize, ct);
        var items = volumes.OrderBy(v => v.SortOrder).Select(ToDto).ToList();
        return new PagedResponse<VolumeDto>(items, totalCount, request.Page, request.PageSize);
    }

    private static VolumeDto ToDto(VolumeEntity v) => new(v.Id, v.StoryId, v.Title, v.Description, v.Color, v.SortOrder, v.ChapterIds, v.CreatedAt, v.UpdatedAt);
}

public class GetVolumeByIdHandler : IRequestHandler<GetVolumeByIdQuery, VolumeDto>
{
    private readonly IRepository<VolumeEntity> _volumeRepo;
    private readonly IOrganizationOwnedRepository<Story> _storyRepo;

    public GetVolumeByIdHandler(IRepository<VolumeEntity> volumeRepo, IOrganizationOwnedRepository<Story> storyRepo)
    {
        _volumeRepo = volumeRepo;
        _storyRepo = storyRepo;
    }

    public async Task<VolumeDto> Handle(GetVolumeByIdQuery request, CancellationToken ct)
    {
        var volume = await _volumeRepo.GetByIdAsync(request.Id, ct);
        if (volume is null)
            throw new KeyNotFoundException("Volume not found");

        var story = await _storyRepo.GetByIdForOrganizationAsync(volume.StoryId, request.OrganizationId!.Value, ct);
        if (story is null || story.UserId != request.UserId)
            throw new KeyNotFoundException("Volume not found");

        return ToDto(volume);
    }

    private static VolumeDto ToDto(VolumeEntity v) => new(v.Id, v.StoryId, v.Title, v.Description, v.Color, v.SortOrder, v.ChapterIds, v.CreatedAt, v.UpdatedAt);
}
