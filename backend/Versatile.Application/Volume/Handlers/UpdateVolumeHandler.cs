using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Volume.Commands;
using Entity = Versatile.Domain.Entities.Volume;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Volume.Handlers;

public class UpdateVolumeHandler : IRequestHandler<UpdateVolumeCommand, VolumeDto>
{
    private readonly DbContext _db;
    public UpdateVolumeHandler(DbContext db) => _db = db;

    public async Task<VolumeDto> Handle(UpdateVolumeCommand request, CancellationToken ct)
    {
        var volume = await _db.Set<Entity>()
            .Include(v => v.Story)
            .FirstOrDefaultAsync(v => v.Id == request.Id && v.Story!.UserId == request.UserId && v.Story!.OrganizationId == request.OrganizationId, ct)
            ?? throw new KeyNotFoundException("Volume not found");

        if (request.Title is not null) volume.Title = request.Title;
        if (request.Description is not null) volume.Description = request.Description;
        if (request.Color is not null) volume.Color = request.Color;
        if (request.SortOrder.HasValue) volume.SortOrder = request.SortOrder.Value;
        if (request.ChapterIds is not null) volume.ChapterIds = request.ChapterIds;
        volume.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return ToDto(volume);
    }

    private static VolumeDto ToDto(Entity v) => new(v.Id, v.StoryId, v.Title, v.Description, v.Color, v.SortOrder, v.ChapterIds, v.CreatedAt, v.UpdatedAt);
}
