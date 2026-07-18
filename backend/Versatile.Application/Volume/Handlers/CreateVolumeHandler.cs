using MediatR;
using Microsoft.EntityFrameworkCore;
using Versatile.Application.DTOs;
using Versatile.Application.Volume.Commands;
using Entity = Versatile.Domain.Entities.Volume;
using Story = Versatile.Domain.Entities.Story;

namespace Versatile.Application.Volume.Handlers;

public class CreateVolumeHandler : IRequestHandler<CreateVolumeCommand, VolumeDto>
{
    private readonly DbContext _db;
    public CreateVolumeHandler(DbContext db) => _db = db;

    public async Task<VolumeDto> Handle(CreateVolumeCommand request, CancellationToken ct)
    {
        if (!await _db.Set<Story>().AnyAsync(s => s.Id == request.StoryId && s.UserId == request.UserId && s.OrganizationId == request.OrganizationId, ct))
            throw new KeyNotFoundException("Story not found");

        var maxOrder = await _db.Set<Entity>()
            .Where(v => v.StoryId == request.StoryId)
            .MaxAsync(v => (int?)v.SortOrder, ct) ?? 0;

        var volume = new Entity
        {
            StoryId = request.StoryId,
            Title = request.Title,
            Description = request.Description,
            Color = request.Color,
            SortOrder = request.SortOrder ?? maxOrder + 1,
            ChapterIds = request.ChapterIds
        };
        _db.Set<Entity>().Add(volume);
        await _db.SaveChangesAsync(ct);
        return ToDto(volume);
    }

    private static VolumeDto ToDto(Entity v) => new(v.Id, v.StoryId, v.Title, v.Description, v.Color, v.SortOrder, v.ChapterIds, v.CreatedAt, v.UpdatedAt);
}
