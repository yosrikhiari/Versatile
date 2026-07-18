using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Volume.Queries;
using Entity = Versatile.Domain.Entities.Volume;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Volume.Handlers;

public class GetVolumesHandler : IRequestHandler<GetVolumesQuery, List<VolumeDto>>
{
    private readonly DbContext _db;
    public GetVolumesHandler(DbContext db) => _db = db;

    public async Task<List<VolumeDto>> Handle(GetVolumesQuery request, CancellationToken ct)
    {
        if (!await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId, ct))
            throw new KeyNotFoundException("Story not found");

        return await _db.Set<Entity>()
            .Where(v => v.StoryId == request.StoryId)
            .OrderBy(v => v.SortOrder)
            .Select(v => new VolumeDto(v.Id, v.StoryId, v.Title, v.Description, v.Color, v.SortOrder, v.ChapterIds, v.CreatedAt, v.UpdatedAt))
            .ToListAsync(ct);
    }
}

public class GetVolumeByIdHandler : IRequestHandler<GetVolumeByIdQuery, VolumeDto>
{
    private readonly DbContext _db;
    public GetVolumeByIdHandler(DbContext db) => _db = db;

    public async Task<VolumeDto> Handle(GetVolumeByIdQuery request, CancellationToken ct)
    {
        var volume = await _db.Set<Entity>()
            .Include(v => v.Story)
            .FirstOrDefaultAsync(v => v.Id == request.Id && v.Story!.UserId == request.UserId, ct)
            ?? throw new KeyNotFoundException("Volume not found");
        return new VolumeDto(volume.Id, volume.StoryId, volume.Title, volume.Description, volume.Color, volume.SortOrder, volume.ChapterIds, volume.CreatedAt, volume.UpdatedAt);
    }
}
